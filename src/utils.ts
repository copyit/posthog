import { Readable } from 'stream'
import tar from 'tar-stream'
import gunzip from 'gunzip-maybe'
import AdmZip from 'adm-zip'

/**
 * @param binary Buffer
 * returns readableInstanceStream Readable
 */
export function bufferToStream(binary: Buffer): Readable {
    const readableInstanceStream = new Readable({
        read() {
            this.push(binary)
            this.push(null)
        },
    })

    return readableInstanceStream
}

export async function getFileFromArchive(archive: Buffer, file: string): Promise<string | null> {
    try {
        return getFileFromZip(archive, file)
    } catch (e) {
        try {
            return await getFileFromTGZ(archive, file)
        } catch (e) {
            throw new Error(`Could not read archive as .zip or .tgz`)
        }
    }
}

export async function getFileFromTGZ(archive: Buffer, file: string): Promise<string | null> {
    const response = await new Promise((resolve: (value: string | null) => void, reject: () => void) => {
        const stream = bufferToStream(archive)
        const extract = tar.extract()

        let rootPath: string | null = null
        let fileData: string | null = null

        extract.on('entry', function (header, stream, next) {
            if (rootPath === null) {
                const rootPathArray = header.name.split('/')
                rootPathArray.pop()
                rootPath = rootPathArray.join('/')
            }
            if (header.name == `${rootPath}/${file}`) {
                stream.on('data', function (chunk) {
                    if (fileData === null) {
                        fileData = ''
                    }
                    fileData += chunk
                })
            }
            stream.on('end', () => next())
            stream.resume() // just auto drain the stream
        })

        extract.on('finish', function () {
            resolve(fileData)
        })

        extract.on('error', reject)

        stream.pipe(gunzip()).pipe(extract)
    })

    return response
}

export function getFileFromZip(archive: Buffer, file: string): string | null {
    const zip = new AdmZip(archive)
    const zipEntries = zip.getEntries() // an array of ZipEntry records
    const root = zipEntries[0].entryName
    const fileData = zip.getEntry(`${root}${file}`)
    if (fileData) {
        return fileData.getData().toString()
    }
    return null
}
