
const { PassThrough } = require('stream')
const { exec } = require('child_process')
const fs = require('fs')
const AWS = require('aws-sdk')
const {
  AWS_REGION = 'us-east-1',
  AWS_BUCKET = 'printawesome'
} = process.env

const path = require('path')

const LIBRE_OFFICE_TMP_DIR = process.env.LIBRE_OFFICE_TMP_DIR || __dirname

const command = filename =>
  `sudo /opt/libreoffice*/program/soffice --headless --convert-to pdf:writer_pdf_Export "${filename}" --outdir ${LIBRE_OFFICE_TMP_DIR}`

module.exports = async (documentPath, { tags }) => {
  let basename = path.basename(documentPath, path.extname(documentPath))
  await new Promise((resolve, reject) => {
    exec(command(documentPath), (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve(true)
    })
  }).catch(err => {
    throw err
  })
  const pdfPath = path.join(path.dirname(documentPath), `${basename}.pdf`)

  let pass = new PassThrough()
  AWS.config.update({ region: AWS_REGION })
  let managedUpload = new AWS.S3.ManagedUpload({
    tags: Object.keys(tags || {}).map(key => ({
      Key: key,
      Value: tags[key]
    })),
    params: {
      Body: pass,
      Bucket: AWS_BUCKET,
      Key: `${basename}.pdf`,
      ContentType: 'application/pdf'
    }
  })
  managedUpload.send()
  let readStream = fs.createReadStream(pdfPath)
  readStream.on('error', console.error.bind(console))
  readStream.pipe(pass)
  await managedUpload.promise()
    .catch(err => console.log(err))
    .then(data => console.log(data))

  await new Promise((resolve, reject) => fs.unlink(documentPath, resolve))
  await new Promise((resolve, reject) => fs.unlink(pdfPath, resolve))
}
