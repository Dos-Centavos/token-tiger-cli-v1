/*
  Unit tests for cli-util.js.
*/

// npm libraries
import { assert } from 'chai'
import sinon from 'sinon'

// Unit under test
import CliUtil from '../../../src/lib/cli-util.js'

const uut = new CliUtil()

describe('#cli-util.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#echo', () => {
    it('should echo a message via shelljs and return printed line', () => {
      sandbox.stub(process.stdout, 'write')

      const result = uut.echo('hi')

      assert.equal(result, 'hi')
      sinon.assert.called(process.stdout.write)
    })
  })
})
