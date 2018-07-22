require('node-fetch')
const http = require('http')
const path = require('path')
const { loadEnv } = require('parameter-store')
const { AWS_REGION, PORT = 3000 } = process.env
const region = AWS_REGION || 'us-east-1'

async function init () {
  await loadEnv('/docx-elasticbeanstalk', { region })
  process.env.AWS_S3_BUCKET_NAME = process.env.BUCKET_NAME
  process.env.AWS_S3_BUCKET_REGION = region
  process.env.AWS_SSM_REGION = region
  const { Pdf } = require('pdf-postprocess-s3')

  const handleMessage = async (message, done) => {
    let { MessageAttributes: { token: { StringValue } } } = message
    let pdf = new Pdf({key: message.Body, token: StringValue})
    pdf.init().convert().then(done)
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
