require('node-fetch')
const http = require('http')
const path = require('path')
const { loadEnv } = require('parameter-store')
const { AWS_REGION = 'us-east-1', PORT = 3000 } = process.env

async function init () {
  await loadEnv('/doc-to-pdf', { region: AWS_REGION })
  const Pdf = require('pdf-postprocess-s3')

  const handleMessage = (message, done) => {
    let { MessageAttributes } = message
    let params = { key: message.Body }
    if (MessageAttributes.token) {
      params.token = MessageAttributes.token.StringValue
    }
    let pdf = new Pdf(params)
    let val = pdf.init()
    console.log(val)
    val.convert().then(done)
  }

  let pdf = new Pdf({
    sqsEndpoint: process.env.SQS_ENDPOINT,
    handleMessage: handleMessage
  })

  pdf.consume()

  http.createServer(async (req, res) => {
    let url = require('url').parse(req.url)
    let { pathname } = url
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.statusCode = 200
    if (pathname === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end('OK')
    } else if (pathname.startsWith('/webhook')) {
      let key = decodeURIComponent(path.basename(pathname))
      let data = await pdf.createMessage({ messageType: 's3' }, key)
      res.setHeader('Content-type', 'application/json')
      res.end(JSON.stringify(data))
    }
  }).listen(PORT, () => {
    console.log(`listening on http://localhost:${PORT}`)
  })
}

init()
