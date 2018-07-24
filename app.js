require('node-fetch')
const http = require('http')
const path = require('path')
const fs = require('fs')
const Consumer = require('sqs-consumer')
const { exec } = require('child_process')
const { loadEnv } = require('parameter-store')
const { PassThrough } = require('stream')
const AWS = require('aws-sdk')

const {
  AWS_REGION = 'us-east-1',
  AWS_BUCKET = 'printawesome',
  PORT = 3000
} = process.env
process.env.AWS_BUCKET = 'printawesome'

const LIBRE_OFFICE_TMP_DIR = process.env.LIBRE_OFFICE_TMP_DIR || '/var/app/current'
const LIBRE_OFFICE_VERSION = process.env.LIBRE_OFFICE_VERSION || '6.0'
// const LIBRE_OFFICE_TMP_DIR = '/Users/ben/repos/doc-to-pdf'

const command = filename =>
  `sudo /opt/libreoffice${LIBRE_OFFICE_VERSION}/program/soffice --headless --convert-to pdf:writer_pdf_Export "${filename}" --outdir ${LIBRE_OFFICE_TMP_DIR}`

const convert = async ({ key }, tmp = LIBRE_OFFICE_TMP_DIR) => {
  let [id, name] = key.split('/')
  let basename = path.basename(key, path.extname(key))
  let params = {
    Bucket: AWS_BUCKET,
    Key: key
  }
  const s3 = new AWS.S3({ region: AWS_REGION })
  let stream = await s3.headObject(params)
    .promise()
    .then(() => s3.getObject(params).createReadStream())
    .catch(err => {
      console.log(err)
    })
  const documentPath = path.join(tmp, name)
  const pdfPath = path.join(tmp, `${basename}.pdf`)
  let writeStream = fs.createWriteStream(documentPath)
  await new Promise((resolve, reject) => {
    stream.pipe(writeStream)
    writeStream.on('close', resolve)
    writeStream.on('error', reject)
  })
  await new Promise((resolve, reject) => {
    exec(command(documentPath), (err, stdout, stderr) => {
      if (err) {
        console.log(err)
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
  let pass = new PassThrough()
  AWS.config.update({ region: AWS_REGION })
  let managedUpload = new AWS.S3.ManagedUpload({
    params: {
      Body: pass,
      Bucket: AWS_BUCKET,
      Key: `${id}/${basename}.pdf`
    }
  })
  managedUpload.send()
  let readStream = fs.createReadStream(pdfPath)
  readStream.on('error', console.log)
  readStream.on('end', () => {
    console.log('end')
  })
  readStream.pipe(pass)
  await managedUpload.promise()
    .catch(err => console.log(err))
    .then(data => console.log(data))

  await new Promise((resolve, reject) => fs.unlink(documentPath, resolve))
  await new Promise((resolve, reject) => fs.unlink(pdfPath, resolve))
}

async function init () {
  await loadEnv('/doc-to-pdf', { region: AWS_REGION })

  let consumer = Consumer.create({
    queueUrl: process.env.SQS_ENDPOINT,
    messageAttributeNames: ['All'],
    batchSize: 1,
    handleMessage: (message, done) => {
      let { MessageAttributes } = message
      let params = { key: message.Body }
      if (MessageAttributes.token) {
        params.token = MessageAttributes.token.StringValue
      }
      convert(params).then(done)
    }
  })

  consumer.start()

  http.createServer(async (req, res) => {
    let url = require('url').parse(req.url)
    let { pathname } = url
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.statusCode = 200
    if (pathname === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end('OK')
    } else if (pathname.startsWith('/convert')) {
      let key = decodeURIComponent(path.basename(pathname))
      console.log({ key })
      convert({ key })
      res.setHeader('Content-type', 'application/json')
      res.end(JSON.stringify({}))
    } else if (pathname.startsWith('/webhook')) {
      let key = decodeURIComponent(path.basename(pathname))
      // let data = await pdf.createMessage({ messageType: 's3' }, key)
      res.setHeader('Content-type', 'application/json')
      res.end(JSON.stringify({}))
    }
  }).listen(PORT, () => {
    console.log(`listening on http://localhost:${PORT}`)
  })
}

init()
