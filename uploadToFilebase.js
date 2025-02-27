import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { CarWriter } from '@ipld/car/writer';
import { filesFromPaths } from 'files-from-path';
import fs from 'fs';
import { CAREncoderStream, createDirectoryEncoderStream } from 'ipfs-car';
import { CID } from 'multiformats/cid';
import { Writable } from 'stream';

// Загрузка в Filebase IPFS .CAR файлов

// Конфигурация клиента
const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: 'https://s3.filebase.com',
  credentials: {
    accessKeyId: '', // key
    secretAccessKey: '', // secret key
  },
  forcePathStyle: true,
});

async function createAndUploadCar(inputPath, bucketName) {
  const outputPath = './temp.car';
  const carFileName = `metadata.car`;
  const placeholderCID = CID.parse(
    'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
  );
  let rootCID;

  // 1. Собираем файлы из директории
  const files = await filesFromPaths(inputPath, { hidden: true });

  // 2. Создаем CAR архив
  const writeStream = fs.createWriteStream(outputPath);

  await createDirectoryEncoderStream(files)
    .pipeThrough(
      new TransformStream({
        transform(block, controller) {
          rootCID = block.cid;
          controller.enqueue(block);
        },
      })
    )
    .pipeThrough(new CAREncoderStream([placeholderCID]))
    .pipeTo(Writable.toWeb(writeStream));

  await new Promise((resolve) => writeStream.close(resolve));

  // 3. Обновляем корневой CID в CAR файле
  const fd = await fs.promises.open(outputPath, 'r+');
  await CarWriter.updateRootsInFile(fd, [rootCID]);
  await fd.close();

  // 4. Загружаем CAR файл
  const readStream = fs.createReadStream(outputPath);

  try {
    const uploader = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: carFileName,
        Body: readStream,
        Metadata: {
          import: 'car',
          'cid-version': '1',
          'Content-Type': 'application/vnd.ipld.car',
        },
      },
      partSize: 1024 * 1024 * 50,
    });

    // Отслеживаем прогресс загрузки
    uploader.on('httpUploadProgress', (progress) => {
      console.log(
        `Upload progress: ${Math.round(
          (progress.loaded / progress.total) * 100
        )}%`
      );
    });

    await uploader.done();
    console.log('CAR file uploaded successfully');

    // 5. Получаем метаданные файла для извлечения CID
    const { Metadata } = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: carFileName,
        Metadata: {
          'x-amz-meta-import': 'car',
        },
      })
    );

    if (!Metadata?.cid) {
      throw new Error('CID not found in file metadata');
    }

    return Metadata.cid;
  } finally {
    readStream.destroy();
    fs.unlinkSync(outputPath); // Удаляем временный файл
  }
}

async function main() {
  try {
    const rootCID = await createAndUploadCar(
      './output/metadata',
      'attentionless'
    );

    console.log('\n✅ CAR upload successful!');
    console.log(`📁 Root CID: ${rootCID}`);
    console.log(`🌐 Access files via:`);
    console.log(`https://ipfs.filebase.io/ipfs/${rootCID}/<filename>`);
  } catch (err) {
    console.error('🚨 Error:', err);
    process.exit(1);
  }
}

main();
