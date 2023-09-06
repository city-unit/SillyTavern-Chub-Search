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
let characterListContainer = null;  // A global variable to hold the reference
let popupState = null;
let savedPopupContent = null;


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

    let first = extension_settings.chub.findCount;
    let page = 1;
    let asc = false;
    let include_forks = false;
    nsfw = nsfw || extension_settings.chub.nsfw;  // Default to extension settings if not provided
    let require_images = false;
    let require_custom_prompt = false;
    searchTerm = searchTerm ? `search=${encodeURIComponent(searchTerm)}&` : '';
    sort = sort || 'download_count';

    // Construct the URL with the search parameters, if any
    // 
    let url = `${API_ENDPOINT_SEARCH}?${searchTerm}first=${first}&page=${page}&sort=${sort}&asc=${asc}&include_forks=${include_forks}&nsfw=${nsfw}&require_images=${require_images}&require_custom_prompt=${require_custom_prompt}`;

    if (includeTags && includeTags.length > 0) {
        url += `&include_tags=${encodeURIComponent(includeTags.join(','))}`;
    }

    if (excludeTags && excludeTags.length > 0) {
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

async function searchCharacters(options) {
    if (characterListContainer && !document.body.contains(characterListContainer)) {
        console.log('Character list container is not in the DOM, removing reference');
        characterListContainer = null;
    }

    const characters = await fetchCharactersBySearch(options);

    return characters;
}

function openSearchPopup() {
    displayCharactersInListViewPopup();
}

async function executeCharacterSearch(options) {
    let characters  = []
    characters = await searchCharacters(options);

    if (characters && characters.length > 0) {
        console.log('Updating character list');
        updateCharacterListInView(characters);
    } else {
        console.log('No characters found');
        characterListContainer.innerHTML = '<div class="no-characters-found">No characters found</div>';
    }
}


// Generate a character list item
function generateCharacterListItem(character, index) {
    return `
        <div class="character-list-item" data-index="${index}">
            <img class="thumbnail" src="${character.url}">
            <div class="info">
                <div class="name">${character.name || "Default Name"} <span class="author">by ${character.author}</span></div>
                <div class="description">${character.description}</div>
                <div class="tags">${character.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
            </div>
            <button class="download-btn" data-path="${character.fullPath}">Download</button>
        </div>
    `;
}

function displayCharactersInListViewPopup() {
    if (savedPopupContent) {
        console.log('Using saved popup content');
        // Append the saved content to the popup container
        callPopup('', "text", '', { okButton: "Close", wide: true, large: true })
        .then(() => {
            savedPopupContent = document.querySelector('.list-and-search-wrapper');
        });

        document.getElementById('dialogue_popup_text').appendChild(savedPopupContent);
        characterListContainer = document.querySelector('.character-list-popup');
        return;
    }

    const listLayout = popupState ? popupState :`
        <div class="list-and-search-wrapper" id="list-and-search-wrapper">
            <div class="character-list-popup">
                ${chubCharacters.map((character, index) => generateCharacterListItem(character, index)).join('')}
            </div>
            <hr>
            <div class="search-container">
                <input type="text" id="characterSearchInput" class="text_pole" placeholder="Search for characters...">
                <input type="text" id="includeTags" class="text_pole" placeholder="Include tags (comma separated)">
                <input type="text" id="excludeTags" class="text_pole" placeholder="Exclude tags (comma separated)">
                <select class="margin0" id="sortOrder">
                <option value="download_count">download_count</option>
                <option value="id">id</option>
                <option value="rating">rating</option>
                <option value="default">default</option>
                <option value="rating_count">rating_count</option>
                <option value="last_activity_at">last_activity_at</option>
                <option value="trending_downloads">trending_downloads</option>
                <option value="created_at">created_at</option>
                <option value="name">name</option>
                <option value="n_tokens">n_tokens</option>
                <option value="random">random</option>
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
            savedPopupContent = document.querySelector('.list-and-search-wrapper');
        });

    characterListContainer = document.querySelector('.character-list-popup');   

    let clone = null;  // Store reference to the cloned image

    characterListContainer.addEventListener('click', function (event) {
        if (event.target.tagName === 'IMG') {
            const image = event.target;

            if (clone) {  // If clone exists, remove it
                document.body.removeChild(clone);
                clone = null;
                return;  // Exit the function
            }

            const rect = image.getBoundingClientRect();

            clone = image.cloneNode(true);
            clone.style.position = 'absolute';
            clone.style.top = `${rect.top + window.scrollY}px`;
            clone.style.left = `${rect.left + window.scrollX}px`;
            clone.style.transform = 'scale(4)';  // Enlarge by 4 times
            clone.style.zIndex = 99999;  // High value to ensure it's above other elements
            clone.style.objectFit = 'contain';

            document.body.appendChild(clone);

            // Prevent this click event from reaching the document's click listener
            event.stopPropagation();
        }
    });

    // Add event listener to remove the clone on next click anywhere
    document.addEventListener('click', function handler() {
        if (clone) {
            document.body.removeChild(clone);
            clone = null;
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

        if (searchTerm || includeTags.length || excludeTags.length || sort) { // Only search if there are values
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
        openSearchPopup();
    });

    loadSettings();
});
