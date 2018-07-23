require('node-fetch')
const http = require('http')
const path = require('path')
const fs = require('fs')
const Consumer = require('sqs-consumer')
const { exec } = require('child_process')
const { loadEnv } = require('parameter-store')
const AWS = require('aws-sdk')

const {
  AWS_REGION = 'us-east-1',
  AWS_BUCKET = 'printawesome',
  PORT = 3000
} = process.env
process.env.AWS_BUCKET = 'printawesome'

const LIBRE_OFFICE_TMP_DIR = process.env.LIBRE_OFFICE_TMP_DIR || '/var/app/current/tmp'
const LIBRE_OFFICE_VERSION = process.env.LIBRE_OFFICE_VERSION || '6.0'

const command = filename =>
  `sudo /opt/libreoffice${LIBRE_OFFICE_VERSION}/program/soffice --headless --convert-to pdf:writer_pdf_Export "${filename}" --outdir ${LIBRE_OFFICE_TMP_DIR}`

const convert = ({ key }, tmp = LIBRE_OFFICE_TMP_DIR) => {
  console.log('converting', { key, tmp })
  let [id, name] = key.split('/')
  let basename = path.basename(key, path.extname(key))
  let stream = s3.getObject({
    Bucket: AWS_BUCKET,
    Key: key
  }).createReadStream()

  return new Promise((resolve, reject) => {
    const documentPath = path.join(tmp, name)
    const pdfPath = path.join(tmp, `${basename}.pdf`)
    console.log({ documentPath, pdfPath })
    stream.pipe(fs.createWriteStream(documentPath))
    stream.on('error', reject)
    stream.on('end', async () => {
      await new Promise((resolve, _) => {
        exec(command(filename), (err, stdout, stderr) => {
          if (err) reject(err)
          resolve(true)
        })
      })
      // const tagging = await this.tagging
      // const tags = tagging && tagging.TagSet
      //  ? tagging.TagSet
      //  : [{ Key: 'token', Value: this.token }]
      const upload = () => {
        let Body = new PassThrough() 
        AWS.config.update({ region: AWS_REGION })
        let managedUpload = new AWS.S3.ManagedUpload({
          tags,
          params: {
            Body,
            Bucket: AWS_BUCKET,
            Key: `${id}/${name}.pdf`
          }
        })   
        managedUpload.send()
        return Body
      }
    
      let pdfStream = fs.createReadStream(pdfPath).pipe(
        upload({ key: `${id}/${name}.pdf` })
      )
      await new Promise((resolve, reject) => {
        pdfStream.on('end', resolve)
        pdfStream.on('error', reject)
      })
      await new Promise((resolve, reject) => fs.unlink(docxPath, resolve))
      await new Promise((resolve, reject) => fs.unlink(pdfPath, resolve))
    })
  })
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
