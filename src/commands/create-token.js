/*
  Create an NFT — mirrors token-tiger-v1 create-nft flow:
  Tus upload → POST /macro/metadata/ (thumbnail, then asset) → POST /token/tokenize-payload/
*/

import fs from 'fs'
import path from 'path'

import { Upload } from 'tus-js-client'

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'

import axios from 'axios'

const appUtils = new AppUtils()

const TOKENS_TYPE_NFT = 1

const STEP_TOTAL = 9

function logStep (n, message) {
  console.log(`[create-token] Step ${n}/${STEP_TOTAL}: ${message}`)
}

function guessFileType (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
  }
  return map[ext] || 'application/octet-stream'
}

function fileDataExtensions (filePath) {
  const ext = path.extname(filePath).replace(/^\./, '').toLowerCase()
  return [ext || 'unknow']
}

/** Local part of email before @, e.g. test@email.com → "test" */
function usernameFromEmail (email) {
  const s = String(email).trim()
  const at = s.indexOf('@')
  if (at === -1) return s
  return s.slice(0, at).trim()
}

function mergeUserProjectIds (session) {
  const ids = new Set()
  for (const list of [session.user?.projects, session.projects]) {
    if (!Array.isArray(list)) continue
    for (const id of list) {
      if (id != null && String(id).trim() !== '') ids.add(String(id))
    }
  }
  return ids
}

/** Owner id from project payload when API sends it (field names vary by backend). */
function resolveProjectOwnerId (project) {
  if (!project) return null
  const u = project.user
  const cand =
    project.owner ??
    project.ownerId ??
    project.userId ??
    project.createdBy ??
    (typeof u === 'string' || typeof u === 'number' ? u : u?._id ?? u?.id)
  if (cand == null || cand === '') return null
  return String(cand)
}

/**
 * NFT collections (tokensType 1) that belong to the user: owner must match userId when
 * the API exposes an owner field; otherwise membership in session project ids is required.
 */
function filterUserNftCollections (apiProjects, userProjectIds, userId) {
  if (!Array.isArray(apiProjects)) return []
  const uid = userId != null ? String(userId) : ''
  return apiProjects.filter((p) => {
    if (!p || p.tokensType !== TOKENS_TYPE_NFT) return false
    const ownerId = resolveProjectOwnerId(p)
    if (ownerId != null) {
      return ownerId === uid
    }
    return userProjectIds.has(String(p._id))
  })
}

/** Last by createdAt when any project has it; otherwise last item in the filtered list */
function pickLastCollection (collections) {
  if (collections.length === 0) return null
  const anyDate = collections.some((p) => p.createdAt)
  if (anyDate) {
    return [...collections].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime()
      const tb = new Date(b.createdAt || 0).getTime()
      if (ta !== tb) return ta - tb
      return String(a._id).localeCompare(String(b._id))
    }).at(-1)
  }
  return collections[collections.length - 1]
}

class CreateToken {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.fs = fs
    this.TusUpload = Upload
    this.run = this.run.bind(this)
  }

  async run (flags) {
    try {
      this.validateFlags(flags)
      logStep(1, 'Validating input and loading session')

      const filename = 'user.json'
      const session = await this.appUtils.getSessionInfo(filename)
      const jwt = session.JWT
      const user = session.user
      if (!jwt) {
        throw new Error('No JWT in session. Run login first.')
      }
      if (!user?._id && !user?.id) {
        throw new Error('No user id in session. Run login again.')
      }

      const base = this.config.apiBaseUrl.replace(/\/$/, '')
      const userId = user._id ?? user.id

      logStep(2, 'Resolving collection')
      const { projectId, projectLabel } = await this.resolveCollectionId({
        base,
        jwt,
        flags,
        session,
        user
      })
      console.log(`[create-token] Collection: "${projectLabel}" (${projectId})`)
      const tusEndpoint = `${base}/files`
      const mainLabel = path.basename(flags.file)
      const mainBytes = this.fs.statSync(flags.file).size
      logStep(3, `Uploading main asset "${mainLabel}" (${mainBytes} bytes) to ${tusEndpoint}`)
      const mainName = await this.tusUpload({
        filePath: flags.file,
        endpoint: tusEndpoint,
        jwt,
        label: 'main asset'
      })
      console.log(`[create-token] Main upload finished (${mainName})`)

      const thumbLabel = path.basename(flags.thumbnail)
      const thumbBytes = this.fs.statSync(flags.thumbnail).size
      logStep(4, `Uploading thumbnail "${thumbLabel}" (${thumbBytes} bytes)`)
      const thumbName = await this.tusUpload({
        filePath: flags.thumbnail,
        endpoint: tusEndpoint,
        jwt,
        label: 'thumbnail'
      })
      console.log(`[create-token] Thumbnail upload finished (${thumbName})`)

      logStep(5, 'Creating thumbnail metadata (POST /macro/metadata/)')
      const thumbMeta = this.buildMetadataModel({
        title: `thumbnail-${flags.name}`,
        projectId,
        filePath: flags.thumbnail,
        userId,
        email: user.email,
        isThumbnail: true,
        isPubliclyAvailable: undefined
      })

      const thumbRes = await this.newMacroPayload(base, jwt, {
        metadata: thumbMeta,
        encryptionFileName: thumbName,
        ignoreEncryption: true
      })
      if (!thumbRes?.success) {
        throw new Error('Thumbnail metadata creation failed.')
      }
      console.log(`[create-token] Thumbnail metadata id: ${thumbRes.metadataId}`)

      logStep(6, 'Creating asset metadata (POST /macro/metadata/)')
      const mainMeta = this.buildMetadataModel({
        title: flags.name,
        projectId,
        filePath: flags.file,
        userId,
        email: user.email,
        isThumbnail: false,
        isPubliclyAvailable: Boolean(flags.public),
        filePreview: thumbRes.metadataId
      })

      const mainRes = await this.newMacroPayload(base, jwt, {
        metadata: mainMeta,
        encryptionFileName: mainName,
        ignoreEncryption: true
      })
      if (!mainRes?.success) {
        throw new Error('Asset metadata creation failed.')
      }
      console.log(`[create-token] Asset metadata id: ${mainRes.metadataId}`)

      const includeGallery = !flags.skipGallery
      const customData = {
        issuerUrl: flags.url ?? '',
        nsfw: Boolean(flags.nsfw),
        gallery: includeGallery,
        about: flags.description ?? '',
        ticker: 'NFT',
        userData: {
          currentUrl: flags.url ?? '',
          templateMetadata: {}
        }
      }

      logStep(7, 'Tokenizing payload / minting NFT (POST /token/tokenize-payload/)')
      const tokenRes = await this.tokenizePayload(base, jwt, {
        payloadId: mainRes.metadataId,
        customData,
        address: flags.address,
        isNFT: true
      })
      if (!tokenRes?.success || !tokenRes.txid) {
        throw new Error('Token creation failed.')
      }
      console.log(`[create-token] Tokenize response ok, txid: ${tokenRes.txid}`)

      if (includeGallery && this.config.inboxGalleryId) {
        logStep(8, 'Adding token to inbox gallery (POST /gallery/nft/add)')
        await this.addTokenToInboxGallery(base, jwt, tokenRes.txid)
        console.log('[create-token] Gallery add finished')
      } else {
        logStep(8, includeGallery
          ? 'Skipping inbox gallery (set TOKEN_TIGER_INBOX_GALLERY to enable)'
          : 'Skipping inbox gallery (--skip-gallery)')
      }

      logStep(9, 'Done')
      console.log('NFT created successfully.')
      console.log(`Token id (txid): ${tokenRes.txid}`)
      return true
    } catch (err) {
      if (err.response?.data) {
        console.log(JSON.stringify(err.response.data, null, 2))
      } else if (err.message) {
        console.log(err.message)
      } else {
        console.log('Error in create-token/run(): ', err)
      }
      return 0
    }
  }

  validateFlags (flags) {
    if (!flags.name || flags.name === '') {
      throw new Error('You must provide a token name with -n / --name.')
    }
    if (!flags.file || !this.fs.existsSync(flags.file)) {
      throw new Error(`Main asset file not found: ${flags.file || '(missing)'}`)
    }
    if (!flags.thumbnail || !this.fs.existsSync(flags.thumbnail)) {
      throw new Error(`Thumbnail file not found: ${flags.thumbnail || '(missing)'}`)
    }
    return true
  }

  async fetchUserProjects (base, jwt) {
    const res = await this.axios.get(`${base}/projects/`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }
    })
    return res.data?.projects ?? []
  }

  async resolveCollectionId ({ base, jwt, flags, session, user }) {
    const provided = flags.collection && String(flags.collection).trim() !== ''
    if (provided) {
      const projectId = String(flags.collection).trim()
      const userIdStr = String(user._id ?? user.id)
      const apiProjects = await this.fetchUserProjects(base, jwt)
      const match = Array.isArray(apiProjects)
        ? apiProjects.find((p) => p && String(p._id) === projectId)
        : null
      if (!match) {
        throw new Error(`Collection not found: ${projectId}`)
      }
      const ownerId = resolveProjectOwnerId(match)
      const userProjectIds = mergeUserProjectIds(session)
      if (ownerId != null) {
        if (ownerId !== userIdStr) {
          throw new Error(
            `Collection "${match.projectLabel || projectId}" is not owned by the logged-in user.`
          )
        }
      } else if (!userProjectIds.has(projectId)) {
        throw new Error(
          `Collection "${match.projectLabel || projectId}" is not in your account.`
        )
      }
      const projectLabel = match.projectLabel ?? projectId
      return { projectId, projectLabel }
    }

    console.log('[create-token] Fetching collections from the API')
    const apiProjects = await this.fetchUserProjects(base, jwt)
    const userProjectIds = mergeUserProjectIds(session)
    const userId = user._id ?? user.id
    const nftCollections = filterUserNftCollections(
      apiProjects,
      userProjectIds,
      userId
    )

    if (nftCollections.length > 0) {
      const last = pickLastCollection(nftCollections)
      const projectLabel = last.projectLabel || last._id
      return { projectId: last._id, projectLabel }
    }

    console.log('[create-token] No NFT collections on account; creating a new one')

    const email = user.email
    if (!email || String(email).trim() === '') {
      throw new Error(
        'No collections found and no email on account. Pass -c / --collection <id> or log in with a user that has an email.'
      )
    }

    const newCollectionLabel = usernameFromEmail(email)
    if (!newCollectionLabel) {
      throw new Error(
        'Could not derive a username from email for the collection label. Pass -c / --collection <id>.'
      )
    }
    console.log(
      `[create-token] Creating new collection with label: ${newCollectionLabel}`
    )

    const project = {
      schemaVersion: 1,
      projectLabel: newCollectionLabel,
      tokensType: TOKENS_TYPE_NFT
    }
    const res = await this.axios.post(
      `${base}/projects/`,
      { project },
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        }
      }
    )
    const data = res.data
    if (!data?.success || !data.project?._id) {
      throw new Error('Failed to create default collection.')
    }
    const id = data.project._id

    if (!session.projects) session.projects = []
    if (!session.projects.includes(id)) {
      session.projects.push(id)
    }
    if (session.user) {
      if (!Array.isArray(session.user.projects)) {
        session.user.projects = []
      }
      if (!session.user.projects.includes(id)) {
        session.user.projects.push(id)
      }
    }
    await this.appUtils.saveUserData('user.json', session)

    const apiLabel = data.project?.projectLabel
    const projectLabel =
      apiLabel != null && String(apiLabel).trim() !== ''
        ? String(apiLabel).trim()
        : newCollectionLabel

    return { projectId: id, projectLabel }
  }

  buildMetadataModel ({
    title,
    projectId,
    filePath,
    userId,
    email,
    isThumbnail,
    isPubliclyAvailable,
    filePreview
  }) {
    const metadata = {
      schemaVersion: 1,
      projectId,
      userIdUpload: userId,
      title,
      isNDA: false,
      owner: userId,
      meta: {
        fileData: fileDataExtensions(filePath),
        filePreview: filePreview ?? '',
        emailOwner: email
      }
    }
    if (isThumbnail) {
      metadata.isThumbnail = true
    } else {
      metadata.isPubliclyAvailable = Boolean(isPubliclyAvailable)
    }
    return metadata
  }

  tusUpload ({ filePath, endpoint, jwt, label = 'file' }) {
    const size = this.fs.statSync(filePath).size
    const stream = this.fs.createReadStream(filePath)
    const basename = path.basename(filePath)
    const filetype = guessFileType(filePath)

    return new Promise((resolve, reject) => {
      // Pass the fs ReadStream directly — tus-js-client wraps it via FileSource when
      // stream.path is set. Do not use StreamSource here (openFile rejects it).
      const upload = new this.TusUpload(stream, {
        endpoint,
        uploadSize: size,
        metadata: {
          filename: basename,
          filetype
        },
        headers: {
          Authorization: `Bearer ${jwt}`
        },
        retryDelays: [0, 3000, 5000, 10000],
        chunkSize: 5 * 1024 * 1024,
        onProgress: (bytesSent, bytesTotal) => {
          if (bytesTotal > 0 && bytesSent === bytesTotal) {
            console.log(`[create-token] Tus ${label}: upload complete (${bytesSent}/${bytesTotal} bytes)`)
          }
        },
        onError: reject,
        onSuccess: () => resolve(basename)
      })
      upload.start()
    })
  }

  async newMacroPayload (base, jwt, body) {
    const res = await this.axios.post(`${base}/macro/metadata/`, body, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    return res.data
  }

  async tokenizePayload (base, jwt, { payloadId, customData, address, isNFT }) {
    const body = { payloadId, customData, isNFT }
    if (address) {
      body.address = address
    }
    const res = await this.axios.post(
      `${base}/token/tokenize-payload/`,
      body,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return res.data
  }

  async addTokenToInboxGallery (base, jwt, tokenId) {
    await this.axios.post(
      `${base}/gallery/nft/add`,
      {
        tokenData: {
          galleryId: this.config.inboxGalleryId,
          tokenId
        }
      },
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        }
      }
    )
  }
}

export default CreateToken

// Exposed for unit tests of branches the command never calls with empty input.
export {
  pickLastCollection,
  resolveProjectOwnerId
}
