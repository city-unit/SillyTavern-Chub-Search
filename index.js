// An extension that allows you to import characters from CHub.

import {
    getRequestHeaders,
    processDroppedFiles,
    callPopup
} from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "st-chub-search";
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
let popupState = null;



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

async function fetchCharactersBySearch({ searchTerm, includeTags, excludeTags, nsfw, sort }) {
    if (!searchTerm) {
        return [];
    }
    let first = extension_settings.chub.findCount;
    let page = 1;
    let asc = false;
    let include_forks = false;
    nsfw = nsfw || extension_settings.chub.nsfw;  // Default to extension settings if not provided
    let require_images = false;
    let require_custom_prompt = false;

    // Construct the URL with the search parameters
    let url = `${API_ENDPOINT_SEARCH}?search=${encodeURIComponent(searchTerm)}&first=${first}&page=${page}&sort=${sort}&asc=${asc}&include_forks=${include_forks}&nsfw=${nsfw}&require_images=${require_images}&require_custom_prompt=${require_custom_prompt}`;

    if (includeTags.length > 0) {
        url += `&include_tags=${encodeURIComponent(includeTags.join(','))}`;
    }

    if (excludeTags.length > 0) {
        url += `&exclude_tags=${encodeURIComponent(excludeTags.join(','))}`;
    }

    let searchResponse = await fetch(url);

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
async function executeCharacterSearch(options) {
    console.log(characterListContainer);
    if (characterListContainer && !document.body.contains(characterListContainer)) {
        characterListContainer = null;
    }

    const characters = await fetchCharactersBySearch(options);
    if(!characterListContainer) {
        displayCharactersInListViewPopup();
    }

    if (characters.length > 0) {
        if (!characterListContainer) {
            displayCharactersInListViewPopup();
        } else {
            updateCharacterListInView(characters);
        }
    }
}

// Generate a character list item
function generateCharacterListItem(character, index) {
    return `
        <div class="character-list-item" data-index="${index}">
            <img class="thumbnail" src="${character.url}">
            <div class="info">
                <div class="name">${character.name || "Default Name"} by ${character.author}</div>
                <div class="description">${character.description}</div>
                <div class="tags">${character.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
            </div>
            <button class="download-btn" data-path="${character.fullPath}">Download</button>
        </div>
    `;
}

let savedPopupContent = null;

function displayCharactersInListViewPopup() {
    if (savedPopupContent) {
        // Append the saved content to the popup container
        callPopup('', "text", '', { okButton: "Close", wide: true, large: true })
            .then(() => {
                savedPopupContent = characterListContainer.detach();
            });

        document.getElementById('yourPopupContainerId').appendChild(savedPopupContent);
        characterListContainer = document.querySelector('.character-list-popup');
        return;
    }
    const listLayout = popupState ? popupState :`
        <div class="list-and-search-wrapper">
            <div class="character-list-popup">
                ${chubCharacters.map((character, index) => generateCharacterListItem(character, index)).join('')}
            </div>
            <hr>
            <div class="search-container">
                <input type="text" id="characterSearchInput" class="text_pole" placeholder="Search for characters...">
                <input type="text" id="includeTags" class="text_pole" placeholder="Include tags (comma separated)">
                <input type="text" id="excludeTags" class="text_pole" placeholder="Exclude tags (comma separated)">
                <select class="margin0" id="sortOrder">
                    <option value="download_count">Most Downloaded</option>
                    <option value="recent">Most Recent</option>
                    <!-- Add more sort options as needed -->
                </select>
                <label for="nsfwCheckbox">NSFW:</label>
                <input type="checkbox" id="nsfwCheckbox">
                <button class="menu_button" id="characterSearchButton">Search</button>
            </div>
        </div>
    `;


    // Call the popup with our list layout
    callPopup(listLayout, "text", '', { okButton: "Close", wide: true, large: true })
        .then(() => {
            savedPopupContent = characterListContainer.detach();
            characterListContainer = null;

        });

    characterListContainer = document.querySelector('.character-list-popup');

    characterListContainer.addEventListener('mouseover', function (event) {
        if (event.target.tagName === 'IMG') {
            const image = event.target;
            const rect = image.getBoundingClientRect();

            const clone = image.cloneNode(true);
            clone.style.position = 'absolute';
            clone.style.top = `${rect.top + window.scrollY}px`;
            clone.style.left = `${rect.left + window.scrollX}px`;
            clone.style.transform = 'scale(4)'; // Enlarge by 4 times
            clone.style.zIndex = 99999; // High value to ensure it's above other elements

            document.body.appendChild(clone);

            // Cleanup on mouse leave or move out
            clone.addEventListener('mouseleave', function handler() {
                document.body.removeChild(clone);
                clone.removeEventListener('mouseleave', handler);
            });
        }
    });

    characterListContainer.addEventListener('click', async function (event) {
        if (event.target.classList.contains('download-btn')) {
            downloadCharacter(event.target.getAttribute('data-path'));
        }
    });

    // Combine the 'keydown' and 'click' event listeners for search functionality
    const handleSearch = function (e) {
        if (e.type === 'keydown' && e.key !== 'Enter') return;

        const searchTerm = document.getElementById('characterSearchInput').value;
        const includeTags = document.getElementById('includeTags').value.split(',').map(tag => tag.trim());
        const excludeTags = document.getElementById('excludeTags').value.split(',').map(tag => tag.trim());
        const nsfw = document.getElementById('nsfwCheckbox').checked;
        const sort = document.getElementById('sortOrder').value;

        if (searchTerm || includeTags.length || excludeTags.length) { // Only search if there are values
            executeCharacterSearch({
                searchTerm,
                includeTags,
                excludeTags,
                nsfw,
                sort
            });
        }
    };

    document.getElementById('characterSearchInput').addEventListener('keydown', handleSearch);
    document.getElementById('characterSearchButton').addEventListener('click', handleSearch);
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
    const settingsHtml = await $.get("scripts/extensions/third-party/st-chub-search/dropdown.html");
    // Append settingsHtml to extensions_settings
    $("#extensions_settings2").append(settingsHtml);

    $("#search-chub").on("click", function () {
        executeCharacterSearch("");
    });

    loadSettings();
});
