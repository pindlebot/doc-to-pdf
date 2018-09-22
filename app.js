const http = require('http')
const https = require('https')
const path = require('path')
const fs = require('fs')
const { randomBytes } = require('crypto')
const convert = require('./src/convert')
const { PORT = 80 } = process.env

async function init () {
  // await loadEnv('/doc-to-pdf', { region: AWS_REGION })

  http.createServer(async (req, res) => {
    let url = require('url').parse(req.url)
    let { pathname } = url
    let key = decodeURIComponent(path.basename(pathname))
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.statusCode = 200

    if (pathname === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end('OK')
    } else if (pathname.startsWith('/convert')) {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      let json = await new Promise((resolve, reject) => {
        req.on('end', () => {
          resolve(JSON.parse(body))
        })
      })
      if (json.url) {
        let { pathname } = url.parse(json.url)
        let parsed = path.parse(pathname)
        https.get(json.url, async resp => {
          let id = randomBytes(10).toString('hex')
          let docPath = path.join('/tmp', `${id}-${parsed.base}`)
          let writeStream = fs.createWriteStream(docPath)
          await new Promise((resolve, reject) => {
            resp.pipe(writeStream)
            writeStream.on('close', resolve)
            writeStream.on('error', reject)
          })
          await convert(docPath, { key, ...json })
        })
      }
      res.setHeader('Content-type', 'application/json')
      res.end(JSON.stringify({}))
    } else if (pathname.startsWith('/webhook')) {
      res.setHeader('Content-type', 'application/json')
      res.end(JSON.stringify({}))
    }
  }).listen(PORT, () => {
    console.log(`listening on http://localhost:${PORT}`)
  })
}

init()
