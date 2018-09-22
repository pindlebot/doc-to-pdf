require('dotenv').config()
const http = require('http')
const https = require('https')
const path = require('path')
const fs = require('fs')
const { randomBytes } = require('crypto')
const convert = require('./convert')
const { PORT = 80 } = process.env
const url = require('url')
const jwt = require('jsonwebtoken')
const bodyParser = async (req, res) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk.toString()
  })
  return new Promise((resolve, reject) => {
    req.on('end', () => {
      resolve(JSON.parse(body))
    })
  })
}

const handleConvert = (json) => {
  let { pathname } = url.parse(json.url)
  let parsed = path.parse(pathname)
  let id = randomBytes(10).toString('hex')
  json.key = json.key || parsed.base
  let docPath = path.join('/tmp', `${id}-${json.key}`)
  https.get(json.url, async resp => {
    let writeStream = fs.createWriteStream(docPath)
    await new Promise((resolve, reject) => {
      resp.pipe(writeStream)
      writeStream.on('close', resolve)
      writeStream.on('error', reject)
    })
    await convert(docPath, json)
  })
}

http.createServer(async (req, res) => {
  let { pathname } = url.parse(req.url)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.statusCode = 200
  let [_, token] = (req.headers.authorization || '').match(/(?:[Bb]earer\s)(.*)/)
  let decoded
  if (token) {
    decoded = await new Promise((resolve, reject) =>
      jwt.verify(token, process.env.SECRET_TOKEN, (err, decoded) => {
        if (err) reject(err)
        else resolve(decoded)
      }).catch(console.log.bind(console))
    )
  }
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html')
    res.end('OK')
  } else if (pathname.startsWith('/convert')) {
    let data = await bodyParser(req, res)
    if (data.url) {
      await handleConvert(data, { decoded })
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
