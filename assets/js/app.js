const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");

const fileControls = document.getElementById("fileControls");
const fileList = document.getElementById("fileList");

const allowedExt = ["jpg", "jpeg", "heic"];
const replaceTags = ["UserComment", "ImageDescription"];

const replaceText = ""; // this replaces value of the indicator tags (padded/truncated to the original length)
const zipName = "spatial";

const fileMap = new Map();

// general functions
function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function disableButtons(element, disabled) {
    const controls = element.querySelectorAll("button");

    for (const control of controls) {
        control.disabled = disabled;
    }
}

function getColor(fileNode) {
    const nameSpan = fileNode.querySelector(".name-span");

    for (const cls of [...nameSpan.classList]) {
        if (cls.startsWith("text-") && cls != "text-truncate") {
            return cls.slice(5);
        }
    }

    return "";
}

async function setColor(fileNode, color, ms = -1) {
    const nameSpan = fileNode.querySelector(".name-span");

    const originalColor = getColor(fileNode);
    if (originalColor) nameSpan.classList.remove(`text-${originalColor}`);

    if (color !== "") {
        nameSpan.classList.add(`text-${color}`);
    }

    if (ms !== -1) {
        await timeout(ms);
        setColor(fileNode, originalColor);
    }

    return null;
}

function splitFileName(fileName) {
    const fileBase = fileName.slice(0, fileName.lastIndexOf("."));
    const fileExt = fileName.split(".").pop();

    return [fileBase, fileExt];
}

// file functions
function removeFile(fileNode) {
    const fileId = fileNode.dataset.fileId;
    const fileName = fileNode.dataset.fileName;
    disableButtons(fileNode, true);

    console.log(`[${fileName}] Removing`);

    fileMap.delete(fileId);
    fileNode.remove();

    if (fileMap.size == 0) {
        disableButtons(fileControls, true);
    }
}

async function convertFile(fileNode) {
    const fileId = fileNode.dataset.fileId;
    const fileName = fileNode.dataset.fileName;
    disableButtons(fileNode, true);

    const fileBuffer = fileMap.get(fileId);
    if (!fileBuffer) {
        console.log(`[${fileName}] Can't convert: buffer not found`);
        alert(`[${fileName}] Can't convert: buffer not found`);

        await setColor(fileNode, "danger");
        disableButtons(fileNode, false);

        return;
    } else if (fileNode.dataset.converted) {
        console.log(`[${fileName}] Skipping, already converted`);

        await setColor(fileNode, "warning", 500);
        disableButtons(fileNode, false);

        return;
    } else {
        console.log(`[${fileName}] Converting`);
    }

    const fileExt = fileNode.dataset.fileExt;
    const [success, output] = fileExt.toLowerCase() == "heic" ? tagsFromHeic(fileBuffer) : tagsFromJpeg(fileBuffer);

    if (!success) {
        console.log(`[${fileName}] Failed to extract tags: ${output}`);
    } else if (output.length == 0) {
        console.log(`[${fileName}] No tags found`);
    }

    for (const tagName in output) {
        let tagValue = output[tagName].value;

        // fix for UserComment
        if (tagName == "UserComment") tagValue = decodeUserComment(tagValue);

        if (replaceTags.includes(tagName) && tagValue != replaceText) {
            overwriteTag(fileBuffer, output[tagName], tagName, replaceText);

            console.log(`[${fileName}] "${tagName}" (${tagValue}) was replaced`);
        }
    }

    // replace XMP description
    const found = overwriteXmp(fileBuffer,
        '<rdf:li xml:lang="x-default">Screenshot</rdf:li>',
        `<rdf:li xml:lang="x-default">${replaceText}</rdf:li>`
    );
    if (found) console.log(`[${fileName}] XMP description was replaced`);

    fileNode.dataset.converted = true;

    await setColor(fileNode, "success");
    disableButtons(fileNode, false);
}

async function downloadFile(fileNode) {
    const fileId = fileNode.dataset.fileId;
    const fileName = fileNode.dataset.fileName;
    disableButtons(fileNode, true);

    const fileBuffer = fileMap.get(fileId);
    if (!fileBuffer) {
        console.log(`[${fileName}] Can't download: buffer not found`);
        alert(`[${fileName}] Can't download: buffer not found`);

        await setColor(fileNode, "danger", 500);
        disableButtons(fileNode, false);

        return;
    } else if (!fileNode.dataset.converted) {
        console.log(`[${fileName}] Skipping, not converted`);

        await setColor(fileNode, "warning", 500);
        disableButtons(fileNode, false);

        return;
    } else {
        console.log(`[${fileName}] Downloading`);
    }

    const fileBase = fileNode.dataset.fileBase;
    const fileExt = fileNode.dataset.fileExt;

    triggerDownload([[fileBuffer, `${fileBase}_${uuid()}.${fileExt}`]]);
    disableButtons(fileNode, false);
}

// global controls
function clearFiles() {
    disableButtons(fileControls, true);
    disableButtons(fileList, true);

    while (fileList.firstElementChild) {
        removeFile(fileList.firstElementChild);
    }
}

async function convertFiles() {
    disableButtons(fileControls, true);
    disableButtons(fileList, true);

    await Promise.all(
        [...fileList.children].map(
            fileNode => convertFile(fileNode)
        )
    );

    disableButtons(fileControls, false);
    disableButtons(fileList, false);
}

function downloadFiles() {
    disableButtons(fileControls, true);
    disableButtons(fileList, true);
    const zipFileName = `${zipName}_${uuid()}`;

    let files = [];
    for (const fileNode of fileList.children) {
        const fileId = fileNode.dataset.fileId;
        const fileName = fileNode.dataset.fileName;

        const fileBuffer = fileMap.get(fileId);
        if (!fileBuffer) {
            console.log(`[${fileName}] Can't ZIP: buffer not found`);
            alert(`[${fileName}] Can't ZIP: buffer not found`);

            continue;
        } else if (!fileNode.dataset.converted) {
            console.log(`[${fileName}] Skipping, not converted`);
            continue;
        } else {
            console.log(`[${fileName}] Zipping`);
        }

        const fileBase = fileNode.dataset.fileBase;
        const fileExt = fileNode.dataset.fileExt;

        files.push([fileBuffer, `${fileBase}_${uuid()}.${fileExt}`]);
    }


    if (files.length == 0) {
        console.log(`[${zipFileName}.zip] No files were zipped, not downloading`);

        alert(`[${zipFileName}.zip] No files were zipped, not downloading`);
    } else {
        console.log(`[${zipFileName}.zip] Downloading`);

        triggerDownload(files);
    }

    disableButtons(fileControls, false);
    disableButtons(fileList, false);
}

// file upload
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    await handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", async () => {
    await handleFiles(fileInput.files);
});

// store file
function uuidv4() {
    if (crypto.randomUUID) return crypto.randomUUID();

    // other method
    const bytes = crypto.getRandomValues(new Uint8Array(16));

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map(b => b.toString(16).padStart(2, "0"));

    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function uuid() {
    // unsafe, but short
    return Math.random().toString(36).substring(2, 10);
}

async function addFile(file) {
    const id = uuidv4();

    const buffer = await file.arrayBuffer();
    fileMap.set(id, buffer);

    if (fileMap.size > 0) {
        disableButtons(fileControls, false);
    }
    return id;
}

// handle file(s)
async function handleFiles(files) {
    function createBtn(color, icon) {
        const fileBtn = document.createElement("button");
        fileBtn.type = "button";
        fileBtn.classList.add("btn", "btn-lg", "btn-white", "text-" + color);
        fileBtn.innerHTML = `<i class="bi bi-${icon}"></i>`;

        return fileBtn;
    }

    for (const file of files) {
        let fileName = file.name;
        let [fileBase, fileExt] = splitFileName(fileName);

        // no more than 100 characters and 4 file extension characters
        fileBase = fileBase.length > 100 ? fileBase.slice(0, 100) : fileBase;
        fileName = `${fileBase}.${(fileExt.length > 5 ? fileExt.slice(0, 5) : fileExt)}`;

        if (!allowedExt.includes(fileExt.toLowerCase())) {
            console.log(`[${fileName}] Extension not allowed, only: ${allowedExt.join(", ")}`);

            alert(`[${fileName}] Extension not allowed, only: ${allowedExt.join(", ")}`);
            continue;
        } else {
            console.log(`[${fileName}] Handling upload`);
        }

        const fileId = await addFile(file);

        const fileItem = document.createElement("li");
        fileItem.className = "list-group-item d-flex align-items-center";
        fileItem.dataset.fileName = fileName;
        fileItem.dataset.fileBase = fileBase;
        fileItem.dataset.fileExt = fileExt;
        fileItem.dataset.fileId = fileId;

        const removeBtn = createBtn("danger", "trash");
        removeBtn.addEventListener("click", () => removeFile(fileItem));
        removeBtn.classList.add("me-2");

        const nameSpan = document.createElement("span");
        nameSpan.classList.add("name-span", "text-truncate");
        nameSpan.textContent = fileName;

        const convertBtn = createBtn("primary", "gear");
        convertBtn.addEventListener("click", async () => convertFile(fileItem));
        convertBtn.classList.add("d-flex", "gap-2", "ms-auto");

        const downloadBtn = createBtn("primary", "download");
        downloadBtn.addEventListener("click", () => downloadFile(fileItem));

        fileItem.appendChild(removeBtn);
        fileItem.appendChild(nameSpan);
        fileItem.appendChild(convertBtn);
        fileItem.appendChild(downloadBtn);

        fileList.appendChild(fileItem);
    };
}

// clear on reload
window.addEventListener("DOMContentLoaded", () => {
    clearFiles();
    disableButtons(fileControls, true);
});

// iOS fix for css :active
document.addEventListener("touchstart", () => { }, true);