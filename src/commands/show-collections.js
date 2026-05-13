/*
  List collections owned by the session user (by owner field or session membership) and sharable collections.
*/

import Table from 'cli-table'

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'

import axios from 'axios'

const appUtils = new AppUtils()

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

/** Collections from the API array that belong to the user when owner matches, or membership in session ids. */
function filterProjectsOwnedByUser (apiProjects, session, userId) {
  if (!Array.isArray(apiProjects)) return []
  const uid = userId != null ? String(userId) : ''
  const userProjectIds = mergeUserProjectIds(session)
  return apiProjects.filter((p) => {
    if (!p) return false
    const ownerId = resolveProjectOwnerId(p)
    if (ownerId != null) {
      return ownerId === uid
    }
    return userProjectIds.has(String(p._id))
  })
}

function sortProjectsForDisplay (rows) {
  return [...rows].sort((a, b) => {
    const la = String(a.projectLabel ?? a._id ?? '')
    const lb = String(b.projectLabel ?? b._id ?? '')
    return la.localeCompare(lb)
  })
}

class ShowCollections {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.Table = Table
    this.run = this.run.bind(this)
  }

  async run (_flags) {
    try {
      const filename = 'user.json'
      const session = await this.appUtils.getSessionInfo(filename)
      const jwt = session.JWT
      const userId = session.user?._id ?? session.user?.id
      if (!jwt) {
        throw new Error('No JWT in session. Run login first.')
      }
      if (!userId) {
        throw new Error('No user id in session. Run login again.')
      }

      const base = this.config.apiBaseUrl.replace(/\/$/, '')
      const headers = {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }

      const projectsRes = await this.axios.get(`${base}/projects/`, { headers })
      const apiProjects = projectsRes.data?.projects ?? []
      const owned = sortProjectsForDisplay(
        filterProjectsOwnedByUser(apiProjects, session, userId)
      )

      console.log('Your collections')
      const collectionTable = new this.Table({
        head: ['Id', 'Label', 'tokensType'],
        colWidths: [28, 30, 12]
      })
      for (const p of owned) {
        collectionTable.push([
          String(p._id ?? ''),
          String(p.projectLabel ?? ''),
          p.tokensType != null ? String(p.tokensType) : ''
        ])
      }
      if (owned.length === 0) {
        collectionTable.push(['—', '(none)', ''])
      }
      console.log(collectionTable.toString())

      const sharableRes = await this.axios.get(
        `${base}/users/share/nft/collections/`,
        { headers }
      )
      const rawSharable = sharableRes.data?.nftSharedCollections
      const sharableList = Array.isArray(rawSharable)
        ? rawSharable.filter(Boolean)
        : []

      console.log('')
      console.log('Sharable collections')
      const sharableTable = new this.Table({
        head: ['Id', 'Label', 'BCH address', 'public', 'hidden'],
        colWidths: [40, 20, 64, 8, 8]
      })
      for (const s of sharableList) {
        sharableTable.push([
          String(s.publicId ?? ''),
          String(s.collectionLabel ?? ''),
          String(s.bchAddress ?? ''),
          s.isPublic === true ? 'yes' : s.isPublic === false ? 'no' : '',
          s.hidden === true ? 'yes' : s.hidden === false ? 'no' : ''
        ])
      }
      if (sharableList.length === 0) {
        sharableTable.push(['—', '(none)', '', ''])
      }
      console.log(sharableTable.toString())

      return true
    } catch (err) {
      if (err.response?.data) {
        console.log(JSON.stringify(err.response.data, null, 2))
      } else if (err.message) {
        console.log(err.message)
      } else {
        console.log('Error in show-collections/run(): ', err)
      }
      return 0
    }
  }
}

export default ShowCollections

// Exposed for unit tests
export {
  resolveProjectOwnerId,
  filterProjectsOwnedByUser
}
