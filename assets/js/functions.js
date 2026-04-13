// Exif-HEIC.js: https://github.com/exif-heic-js/exif-heic-js
const exifTags = {
    0x9286: "UserComment"
}

const tiffTags = {
    0x010E: "ImageDescription",
    0x8769: "ExifIFDPointer"
}

function readTags(dataView, tiffStart, dirStart, tagsBind, littleEnd) {
    const tagEntries = dataView.getUint16(dirStart, littleEnd);

    let tagMap = {};

    for (let i = 0; i < tagEntries; i++) {
        
        const entryOffset = dirStart + i * 12 + 2;
        let tagId = dataView.getUint16(entryOffset, littleEnd);

        tagName = tagsBind[tagId];
        if (!tagName) continue;

        let type = dataView.getUint16(entryOffset + 2, littleEnd);

        let numValues = dataView.getUint32(entryOffset + 4, littleEnd);
        let valueOffset = dataView.getUint32(entryOffset + 8, littleEnd);

        tagMap[tagName] = {
            value: readTagValue(dataView, entryOffset, tiffStart, littleEnd),
            type: type,
            numValues: numValues,
            littleEnd: littleEnd,
            tiffStart: tiffStart,
            entryOffset: entryOffset,
            valueOffset: valueOffset + tiffStart
        };
    }
    return tagMap;
}

function readTagValue(dataView, entryOffset, tiffStart, littleEnd) {
    let type = dataView.getUint16(entryOffset + 2, littleEnd)
    let numValues = dataView.getUint32(entryOffset + 4, littleEnd);
    let valueOffset = dataView.getUint32(entryOffset + 8, littleEnd) + tiffStart;

    let offset, values, value, n, numerator, denominator;

    switch (type) {
        case 1:
        case 7:
            if (numValues == 1) {
                return dataView.getUint8(entryOffset + 8, littleEnd);
            } else {
                offset = numValues > 4 ? valueOffset : (entryOffset + 8);
                values = [];
                for (n = 0; n < numValues; n++) {
                    values[n] = dataView.getUint8(offset + n);
                }
                return values;
            }

        case 2:
            offset = numValues > 4 ? valueOffset : (entryOffset + 8);
            return readAscii(dataView, offset, numValues - 1);

        case 3:
            if (numValues == 1) {
                return dataView.getUint16(entryOffset + 8, littleEnd);
            } else {
                offset = numValues > 2 ? valueOffset : (entryOffset + 8);
                values = [];
                for (n = 0; n < numValues; n++) {
                    values[n] = dataView.getUint16(offset + 2 * n, littleEnd);
                }
                return values;
            }

        case 4:
            if (numValues == 1) {
                return dataView.getUint32(entryOffset + 8, littleEnd);
            } else {
                values = [];
                for (n = 0; n < numValues; n++) {
                    values[n] = dataView.getUint32(valueOffset + 4 * n, littleEnd);
                }
                return values;
            }

        case 5:
            if (numValues == 1) {
                numerator = dataView.getUint32(valueOffset, littleEnd);
                denominator = dataView.getUint32(valueOffset + 4, littleEnd);
                value = new Number(numerator / denominator);
                value.numerator = numerator;
                value.denominator = denominator;
                return value;
            } else {
                values = [];
                for (n = 0; n < numValues; n++) {
                    numerator = dataView.getUint32(valueOffset + 8 * n, littleEnd);
                    denominator = dataView.getUint32(valueOffset + 4 + 8 * n, littleEnd);
                    values[n] = new Number(numerator / denominator);
                    values[n].numerator = numerator;
                    values[n].denominator = denominator;
                }
                return values;
            }

        case 9:
            if (numValues == 1) {
                return dataView.getInt32(entryOffset + 8, littleEnd);
            } else {
                values = [];
                for (n = 0; n < numValues; n++) {
                    values[n] = dataView.getInt32(valueOffset + 4 * n, littleEnd);
                }
                return values;
            }

        case 10:
            if (numValues == 1) {
                return dataView.getInt32(valueOffset, littleEnd) / dataView.getInt32(valueOffset + 4, littleEnd);
            } else {
                values = [];
                for (n = 0; n < numValues; n++) {
                    values[n] = dataView.getInt32(valueOffset + 8 * n, littleEnd) / dataView.getInt32(valueOffset + 4 + 8 * n, littleEnd);
                }
                return values;
            }
    }
}

function readAscii(dataView, start, length) {
    let str = "";
    for (let i = 0; i < length; i++) {
        str += String.fromCharCode(dataView.getUint8(start + i));
    }
    return str;
}

function readExif(dataView, start) {
    let littleEnd;

    if (dataView.getUint16(start) == 0x4949) {
        littleEnd = true;
    } else if (dataView.getUint16(start) == 0x4D4D) {
        littleEnd = false;
    } else {
        // invalid tiff
        return [false, "Invalid TIFF"];
    }

    if (dataView.getUint16(start + 2, littleEnd) != 0x002A) {
        // invalid tiff
        return [false, "Invalid TIFF"];
    }

    const firstIFDOffset = dataView.getUint32(start + 4, littleEnd);
    if (firstIFDOffset < 0x00000008) {
        // invalid tiff
        return [false, "Invalid TIFF"];
    }

    const tiffOutput = readTags(dataView, start, start + firstIFDOffset, tiffTags, littleEnd);
    const exifIDPPointer = tiffOutput.ExifIFDPointer?.value;
    if (exifIDPPointer) {
        let combinedOutput = tiffOutput;

        const exifOutput = readTags(dataView, start, start + exifIDPPointer, exifTags, littleEnd);
        
        for (tagName in exifOutput) {
            combinedOutput[tagName] = exifOutput[tagName];
        }

        return [true, combinedOutput];
    } else {
        return [true, tiffOutput];
    }
}

function tagsFromHeic(buffer) {
    const dataView = new DataView(buffer);

    let boxOffset = dataView.getUint32(0);
    let metaOffset, metaSize

    // find meta
    while (boxOffset + 8 <= dataView.byteLength) {
        const boxSize = dataView.getUint32(boxOffset);
        const boxName = readAscii(dataView, boxOffset + 4, 4);
        if (boxName == "meta") {
            metaOffset = boxOffset;
            metaSize = boxSize;
            break;
        } else {
            boxOffset += boxSize;
        }
    }

    if (metaOffset === undefined || metaSize === undefined) return [true, {}];

    // find exif and iloc offset
    let exifOffset, ilocOffset;
    for (let i = metaOffset; i < metaOffset + metaSize; i++) {
        const type = readAscii(dataView, i, 4).toLowerCase();
        if (type == "exif") {
            exifOffset = i;
        } else if (type == "iloc") {
            ilocOffset = i;
        }
    }

    if (exifOffset === undefined || ilocOffset === undefined) return [true, {}];

    // find exif start, read
    const exifIdx = dataView.getUint16(exifOffset - 4);
    for (let i = ilocOffset + 12; i < metaOffset + metaSize; i += 16) {
        let itemIdx = dataView.getUint16(i);
        if (itemIdx == exifIdx) {
            let exifLocation = dataView.getUint32(i + 8);
            let prefixSize = 4 + dataView.getUint32(exifLocation);

            let exifStart = exifLocation + prefixSize;
            return readExif(dataView, exifStart);
        }
    }

    return [true, {}];
}

function tagsFromJpeg(buffer) {
    const dataView = new DataView(buffer);

    if ((dataView.getUint8(0) != 0xFF) || (dataView.getUint8(1) != 0xD8)) {
        // invalid jpeg
        return [false, "Invalid JPEG"];
    }

    offset = 2;
    while (offset < buffer.byteLength) {
        if (dataView.getUint8(offset) != 0xFF) {
            // invalid marker
            return [false, "Invalid marker"];
        }
        
        let marker = dataView.getUint8(offset + 1);
        if (marker == 225) {
            return readExif(dataView, offset + 4 + 6);
        } else {
            offset += 2 + dataView.getUint16(offset + 2);
        }
    }

    return [true, {}];
}

function overwriteTag(buffer, tagInfo, tagName, newValue) {
    const dataView = new DataView(buffer);

    let maxBytes, baseOffset;

    if (tagName == "UserComment") {
        maxBytes = Math.max(0, tagInfo.numValues - 8);
        baseOffset = 8;

        // charset prefix
        const charset = [0x41, 0x53, 0x43, 0x49, 0x49, 0x00, 0x00, 0x00];
        for (let i = 0; i < 8; i++) {
            dataView.setUint8(tagInfo.valueOffset + i, charset[i]);
        }
    } else if (tagName == "ImageDescription") {
        maxBytes = tagInfo.numValues;
        baseOffset = 0;
    } else {
        // not implemented
        return;
    }

    baseOffset += tagInfo.numValues > 4
        ? tagInfo.valueOffset
        : tagInfo.entryOffset + 8;

    const encoded = [];
    for (let i = 0; i < newValue.length; i++) {
        const code = newValue.charCodeAt(i);
        encoded.push(code <= 0x7F ? code : 0x3F);
    }

    // truncate
    if (encoded.length > maxBytes) {
        encoded.length = maxBytes;
    }
    
    // write bytes and add padding (0x00)
    for (let i = 0; i < maxBytes; i++) {
        dataView.setUint8(
            baseOffset + i,
            i < encoded.length ? encoded[i] : 0x00
        );
    }
}

function findBytes(bytes, patternBytes) {
    for (let i = 0; i <= bytes.length - patternBytes.length; i++) {
        let match = true;

        for (let j = 0; j < patternBytes.length; j++) {
            if (bytes[i + j] !== patternBytes[j]) {
                match = false;
                break;
            }
        }

        if (match) return i;
    }

    return null;
}

function overwriteXmp(buffer, snippet, replace) {
    const encoder = new TextEncoder();
    const bytes = new Uint8Array(buffer);

    const snippetBytes = encoder.encode(snippet);
    if (snippet.length < replace.length) {
        replace.length = snippet.length;
    } else if (snippet.length > replace.length) {
        replace += " ".repeat(snippet.length - replace.length);
    }

    const replaceBytes = encoder.encode(replace);
    const snippetIdx = findBytes(bytes, snippetBytes);
    if (snippetIdx !== null) {
        bytes.set(replaceBytes, snippetIdx);
        return true;
    } else {
        return false;
    }
}

// zip.js: https://github.com/pwasystem/zip
class Zip {
    constructor(name) {
        this.name = name;
        this.zip = {};
        this.file = [];
        this.o = this.makeo();
    }

    dec2bin = (dec, size) => dec.toString(2).padStart(size, "0");
    str2dec = (str) => Array.from(new TextEncoder().encode(str));
    str2hex = (str) => [...new TextEncoder().encode(str)].map((x) => x.toString(16).padStart(2, "0"));
    hex2buf = (hex) => new Uint8Array(hex.split(" ").map((x) => parseInt(x, 16)));
    bin2hex = (bin) => (parseInt(bin.slice(8), 2).toString(16).padStart(2, "0") + " " + parseInt(bin.slice(0, 8), 2).toString(16).padStart(2, "0"));

    reverse = (hex) => {
        let hexArray = [];
        for (let i = 0; i < hex.length; i += 2) hexArray[i] = hex[i] + "" + hex[i + 1];
        return hexArray.filter((a) => a).reverse().join(" ");
    };

    makeo = () => {
        let o = [];
        for (let c = 0; c < 256; c++) {
            let a = c;
            for (let f = 0; f < 8; f++) a = 1 & a ? 3988292384 ^ (a >>> 1) : a >>> 1;
            o[c] = a;
        }
        return o;
    };

    crc32 = (r) => {
        let n = -1;
        for (let t = 0; t < r.length; t++) n = (n >>> 8) ^ this.o[255 & (n ^ r[t])];
        return this.reverse(((-1 ^ n) >>> 0).toString(16).padStart(8, "0"));
    };

    addFile(filename, buffer, folder = "") {
        let uint = new Uint8Array(buffer);
        uint.name = filename;
        uint.modTime = Date.now();
        uint.fileUrl = filename;
        this.zip[uint.fileUrl] = uint;
    }

    makeZip() {
        let count = 0;
        let fileHeader = "";
        let centralDirectoryFileHeader = "";
        let directoryInit = 0;
        let offSetLocalHeader = "00 00 00 00";
        let zip = this.zip;

        for (const name in zip) {
            let modTime = () => {
                let lastMod = new Date(zip[name].modTime);
                let hour = this.dec2bin(lastMod.getHours(), 5);
                let minutes = this.dec2bin(lastMod.getMinutes(), 6);
                let seconds = this.dec2bin(Math.round(lastMod.getSeconds() / 2), 5);
                let year = this.dec2bin(lastMod.getFullYear() - 1980, 7);
                let month = this.dec2bin(lastMod.getMonth() + 1, 4);
                let day = this.dec2bin(lastMod.getDate(), 5);
                return this.bin2hex(`${hour}${minutes}${seconds}`) + " " + this.bin2hex(`${year}${month}${day}`);
            };

            let crc = this.crc32(zip[name]);
            let size = this.reverse(parseInt(zip[name].length).toString(16).padStart(8, "0"));
            let nameBytes = new TextEncoder().encode(zip[name].fileUrl);
            let nameSize = this.reverse(nameBytes.length.toString(16).padStart(4, "0"));
            let nameFile = this.str2hex(zip[name].fileUrl).join(" ");

            let fileHeaderStr = `50 4B 03 04 14 00 00 00 00 00 ${modTime()} ${crc} ${size} ${size} ${nameSize} 00 00 ${nameFile}`;
            let fileHeaderBuffer = this.hex2buf(fileHeaderStr);

            directoryInit += fileHeaderBuffer.length + zip[name].length;

            centralDirectoryFileHeader += `50 4B 01 02 14 00 14 00 00 00 00 00 ${modTime()} ${crc} ${size} ${size} ${nameSize} 00 00 00 00 00 00 01 00 20 00 00 00 ${offSetLocalHeader} ${nameFile} `;

            offSetLocalHeader = this.reverse(directoryInit.toString(16).padStart(8, "0"));

            this.file.push(fileHeaderBuffer, new Uint8Array(zip[name]));
            count++;
        }

        centralDirectoryFileHeader = centralDirectoryFileHeader.trim();
        let entries = this.reverse(count.toString(16).padStart(4, "0"));
        let dirSize = this.reverse(centralDirectoryFileHeader.split(" ").length.toString(16).padStart(8, "0"));
        let dirInit = this.reverse(directoryInit.toString(16).padStart(8, "0"));
        let centralDirectory = `50 4b 05 06 00 00 00 00 ${entries} ${entries} ${dirSize} ${dirInit} 00 00`;

        this.file.push(this.hex2buf(centralDirectoryFileHeader), this.hex2buf(centralDirectory));

        return new Blob(this.file, { type: "application/octet-stream" });
    }
}

function triggerDownload(files) {
    // format: [[buffer, filename], [buffer, filename]]
    if (navigator.share) {
        try {
            let shareFiles = [];
            for (const [fileBuffer, fileName] of files) {
                const fileBlob = new Blob([fileBuffer], { type: "application/octet-stream" });

                const file = new File([fileBlob], fileName, { type: "application/octet-stream" });
                shareFiles.push(file);
            }
            
            navigator.share({
                files: shareFiles,
                title: "title"
            });
            return;
        } catch (e) {
            // fail
        }
    }

    // fallback
    let fileBlob, fileName;
    if (files.length > 1) {
        // create ZIP
        const zipFileName = `${zipName}_${uuid()}`;
        fileName = `${zipFileName}.zip`;

        const zipFile = new Zip(zipFileName);
        for (const [fileBuffer, fileName] of files) {
            zipFile.addFile(fileName, fileBuffer);
        }

        fileBlob = zipFile.makeZip();
    } else {
        const fileBuffer = files[0][0];
        fileName = files[0][1];

        fileBlob = new Blob([fileBuffer], { type: "application/octet-stream" });
    }

    const blobUrl = URL.createObjectURL(fileBlob);
    const blobElem = document.createElement("a");

    blobElem.href = blobUrl;
    blobElem.download = fileName;
    blobElem.click();

    URL.revokeObjectURL(blobUrl);
}

function decodeUserComment(rawBytes) {
    if (!rawBytes || rawBytes.length <= 8) return "";

    let result = "";
    for (let i = 8; i < rawBytes.length; i++) {
        const c = rawBytes[i];
        if (c === 0) break;
        result += String.fromCharCode(c);
    }
    return result.trim();
}