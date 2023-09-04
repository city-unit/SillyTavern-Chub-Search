// An extension that allows you to import characters from CHub.

import {
    getRequestHeaders,
    processDroppedFiles,
    callPopup
} from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "chub";
const extensionFolderPath = `scripts/extensions/${extensionName}/`;

// Endpoint for API call
const API_ENDPOINT_SEARCH = "https://api.chub.ai/api/characters/search";
const API_ENDPOINT_DOWNLOAD = "https://api.chub.ai/api/characters/download";

const defaultSettings = {
    findCount: 10,
    nsfw: false,
};

let chubCharacters = [];
let currentIndex = 0;
let characterListContainer = null;  // A global variable to hold the reference


/**
 * Asynchronously loads settings from `extension_settings.chub`, 
 * filling in with default settings if some are missing.
 * 
 * After loading the settings, it also updates the UI components 
 * with the appropriate values from the loaded settings.
 */
async function loadSettings() {
    // Ensure extension_settings.timeline exists
    if (!extension_settings.chub) {
        console.log("Creating extension_settings.chub");
        extension_settings.chub = {};
    }

    // Check and merge each default setting if it doesn't exist
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (!extension_settings.chub.hasOwnProperty(key)) {
            console.log(`Setting default for: ${key}`);
            extension_settings.chub[key] = value;
        }
    }

}

async function downloadCharacter(input) {
    const url = input.trim();
    console.debug('Custom content import started', url);

    const request = await fetch('/import_custom', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ url }),
    });

    if (!request.ok) {
        toastr.info(request.statusText, 'Custom content import failed');
        console.error('Custom content import failed', request.status, request.statusText);
        return;
    }

    const data = await request.blob();
    const customContentType = request.headers.get('X-Custom-Content-Type');
    const fileName = request.headers.get('Content-Disposition').split('filename=')[1].replace(/"/g, '');
    const file = new File([data], fileName, { type: data.type });

    switch (customContentType) {
        case 'character':
            processDroppedFiles([file]);
            break;
        default:
            toastr.warning('Unknown content type');
            console.error('Unknown content type', customContentType);
            break;
    }
}

function updateCharacterListInView(characters) {
    if (characterListContainer) {
        characterListContainer.innerHTML = characters.map(generateCharacterListItem).join('');
    }
}

async function fetchCharactersBySearch(query) {
    console.log(extension_settings.chub);
    // Example search: https://api.chub.ai/api/characters/search?first=40&page=1&sort=download_count&asc=false&include_forks=false&nsfw=false&require_images=false&require_custom_prompt=false
    let first = extension_settings.chub.findCount;
    let page = 1;
    let sort = "download_count";
    let asc = false;
    let include_forks = false;
    let nsfw = extension_settings.chub.nsfw;
    let require_images = false;
    let require_custom_prompt = false;
    let search = query;
    let searchResponse = await fetch(
        `${API_ENDPOINT_SEARCH}?search=${encodeURIComponent(query)}&first=${first}&page=1&sort=${sort}&asc=${asc}&include_forks=${include_forks}&nsfw=${nsfw}&require_images=${require_images}&require_custom_prompt=${require_custom_prompt}`
    );

    let searchData = await searchResponse.json();

    // Clear previous search results
    chubCharacters = [];

    let charactersPromises = searchData.nodes.map(node => getCharacter(node.fullPath));
    let characterBlobs = await Promise.all(charactersPromises);

    characterBlobs.forEach((character, i) => {
        let imageUrl = URL.createObjectURL(character);
        chubCharacters.push({
            url: imageUrl,
            description: searchData.nodes[i].tagline || "Description here...",
            name: searchData.nodes[i].name,
            fullPath: searchData.nodes[i].fullPath,
            tags: searchData.nodes[i].topics,
            author: searchData.nodes[i].fullPath.split('/')[0],
        });
    });

    return chubCharacters;
}

// Execute character search and update UI
async function executeCharacterSearch(query) {
    const characters = await fetchCharactersBySearch(query);

    if (characters.length > 0) {
        if (!characterListContainer) {
            displayCharactersInListViewPopup();
        } else {
            updateCharacterListInView(characters);
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Generate a character list item
function generateCharacterListItem(character, index) {
    return `
        <div class="character-list-item" data-index="${index}">
            <img class="thumbnail" src="${character.url}">
            <div class="info">
                <div class="name">${character.name || "Default Name"}</div>
                <div class="description">${character.description}</div>
            </div>
            <button class="download-btn" data-path="${character.fullPath}">Download</button>
        </div>
    `;
}

function displayHoverPreview(item, character) {
    const previewLayout = `
        <div class="character-preview">
            <img class="preview-image" src="${character.url}">
            <div class="preview-info">
                <div class="name">${character.name || "Default Name"}</div>
                <div class="description">${character.description}</div>
            </div>
        </div>
    `;

    const preview = document.createElement('div');
    preview.classList.add('character-preview-container');
    preview.innerHTML = previewLayout;
    document.body.appendChild(preview);

    const rect = item.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const top = rect.top - previewRect.height / 2 + rect.height / 2;
    const left = rect.left - previewRect.width / 2 + rect.width / 2;

    preview.style.top = `${top}px`;
    preview.style.left = `${left}px`;

    item.addEventListener('mouseleave', function (event) {
        preview.remove();
    });
}

function displayCharactersInListViewPopup() {
    const listLayout = `
        <div class="search-container">
            <input type="text" id="characterSearchInput" placeholder="Search for characters...">
        </div>
        <div class="character-list-popup">
            ${chubCharacters.map((character, index) => generateCharacterListItem(character, index)).join('')}
        </div>
    `;

    // Call the popup with our list layout
    callPopup(listLayout, "text", '', { okButton: "Close", wide: true, large: true });
    characterListContainer = document.querySelector('.character-list-popup');

    document.querySelector('.character-list-popup').addEventListener('click', async function (event) {
        if (event.target && event.target.classList.contains('download-btn')) {
            downloadCharacter(event.target.getAttribute('data-path'));
        }
    });

    document.querySelectorAll('.character-list-item .img').forEach(item => {
        const index = parseInt(item.getAttribute('data-index'));
        const character = chubCharacters[index];
        item.addEventListener('mouseenter', () => displayHoverPreview(item, character));
    });

    document.getElementById('characterSearchInput').addEventListener('input', debounce(function (e) {
        const searchTerm = e.target.value;
        if (searchTerm) {  // Only search if there is a value to search for
            executeCharacterSearch(searchTerm);
        }
    }, 500));
}

async function getCharacter(fullPath) {
    let response = await fetch(
        API_ENDPOINT_DOWNLOAD,
        {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fullPath: fullPath,
                format: "tavern",
                version: "main"
            }),
        }
    );

    let data = await response.blob();
    return data;
}


jQuery(async () => {
    const settingsHtml = await $.get("scripts/extensions/third-party/chub/dropdown.html");
    // Append settingsHtml to extensions_settings
    $("#extensions_settings2").append(settingsHtml);

    $("#search-chub").on("click", function () {
        executeCharacterSearch("");
    });

    loadSettings();
});
