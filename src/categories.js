import fetch from './fetch.js';
import { log } from './log.js';
import { load, getConst, updateFile } from './storage.js';
import { parseDOM } from './DOMParser.js';
import { headers } from './account.js';

let categoriesCache = await load('data/categoriesCache.json');

async function updateCategoriesData() {
    log(`Обновляем список категорий...`, 'c');
    const cat = await getAllCategories(global.appData.id);
    const data = await getCategoriesData(cat);

    await updateFile(data, `data/categories.json`);
    log(`Список категорий обновлён.`, 'g');
    return data;
}

async function getCategoriesData(categories) {
    let result = [];

    try {
        for(let i = 0; i < categories.length; i++) {
            let categoryData = {};
            const nodeId = categories[i].split('/')[4];

            categoryData = getCached(nodeId);

            if(categoryData) {
                result.push(categoryData);
                continue;
            }
            
            categoryData = await getCategoryData(categories[i]);
            categoriesCache.push(categoryData);

            result.push(categoryData);
        }

        await updateFile(categoriesCache, 'data/categoriesCache.json');
    } catch (err) {
        log(`Ошибка при получении данных категорий: ${err}`, 'r');
    }

    return result;
}

async function getCategoryData(category) {
    let result = {};
    if(!category) return result;
    try {
        const options = {
            method: 'GET',
            headers: headers
        };

        const resp = await fetch(category, options);
        const body = await resp.text();
        
        const doc = parseDOM(body);
        const buttonEl = doc.querySelector(".col-sm-6").firstElementChild;
        const textEl = doc.querySelector(".inside");
        const text = textEl.innerHTML.replace('&nbsp;', ' ');
        
        result = {
            name: text,
            node_id: buttonEl.dataset.node,
            game_id: buttonEl.dataset.game
        }
    } catch (err) {
        log(`Ошибка при получении данных категории: ${err}`, 'r');
    }
    return result;
}

async function getAllCategories(id) {
    let result = [];
    try {
        const options = {
            method: 'GET',
            headers: headers
        };

        const resp = await fetch(`${getConst('api')}/users/${id}/`, options);
        const body = await resp.text();

        const doc = parseDOM(body);
        const categories = doc.querySelectorAll(".offer-list-title-button");

        for(let i = 0; i < categories.length; i++) {
            if(categories[i].firstElementChild.href.includes('chips')) continue;
            
            result.push(categories[i].firstElementChild.href);
        }
    } catch (err) {
        log(`Ошибка при получении категорий: ${err}`, 'r');
    }
    return result;
}

function getCached(nodeId) {
    if(!categoriesCache) categoriesCache = [];

    for(let i = 0; i < categoriesCache.length; i++) {
        let categorieCache = categoriesCache[i];
        if(!categorieCache || categorieCache['node_id'] != nodeId) continue;

        return categorieCache;
    }

    return false;
}

export { getAllCategories, getCategoryData, getCategoriesData, updateCategoriesData };