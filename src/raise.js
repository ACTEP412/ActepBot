import c from 'chalk';
import fetch from './fetch.js';
import { log } from './log.js';
import { sleep } from './event.js';
import { load, loadSettings, getConst } from './storage.js';

const config = global.settings;

async function enableLotsRaise() {
    let categories = await load('data/categories.json');
    
    for(let i = 0; i < categories.length; i++) {
        categories[i].time = 0;
    }

    log(`Автоподнятие запущено, загружено ${c.yellowBright(categories.length)} категория(ий).`);

    await raiseLotsIfTime(categories);
    setInterval(() => {
        raiseLotsIfTime(categories);
    },
    10000);
}

async function raiseLotsIfTime(categories) {
    try {    
        for(let i = 0; i < categories.length; i++) {
            const cat = categories[i];
            const date = new Date();
            const now = date.getTime();
    
            if(now < cat.time) continue;
                
            let res = await raiseLot(cat.game_id, cat.node_id);

            if(!res.success) {
                log(`Не удалось поднять предложение ${cat.name}: ${res.msg}`);
                cat.time = getNewTiming();
                continue;
            }

            if(res.msg.includes("Подождите")) {
                cat.time = getNewTiming(res.msg);
                //log(`Предложения в категории '${c.yellowBright(cat.name)}' ещё поднимать рано. Следующее поднятие: ${c.yellowBright(res.msg)} / ${c.yellowBright(new Date(cat.time).toString())}`, 'c');
            }

            if(res.msg.includes("подняты")) {
                res = await raiseLot(cat.game_id, cat.node_id);
                cat.time = getNewTiming(res.msg);
                log(`Предложения в категории '${c.yellowBright(cat.name)}' подняты. Следующее поднятие: ${c.yellowBright(res.msg)}`, 'g');
            }

            await sleep(500);
        }
    } catch (err) {
        log(`Ошибка при поднятии предложений: ${err}`, 'r');
    }
}

async function raiseLots(categories) {
    try {
        let error = false;
        let raised = 0;
        let waiting = 0;
        raiseCounter++;
    
        for(let i = 0; i < categories.length; i++) {
            const lot = categories[i];
    
            let res = await raiseLot(lot.game_id, lot.node_id);

            if(!res.success) {
                error = true;
                log(`Не удалось поднять предложение ${lot.name}: ${res.msg}`);
                continue;
            }

            if(res.msg.includes("Подождите")) {
                waiting++;
            }

            if(res.msg.includes("подняты")) {
                raised++;
            }
    
            await sleep(500);
        }

        if(!error) {
            log(`Предложения подняты (${c.yellowBright(waiting)} в ожидании, ${c.yellowBright(raised)} поднято).`, 'g');
        }
    } catch (err) {
        log(`Ошибка при поднятии предложений: ${err}`, 'r');
    }
}

async function raiseLot(game_id, node_id) {
    try {
        const raiseUrl = `${getConst('api')}/lots/raise`;

        const params = new URLSearchParams();
        params.append('game_id', game_id);
        params.append('node_id', node_id);

        const headers = {
            "accept": "*/*",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "cookie": `locale=ru; golden_key=${config.token}`,
            "x-requested-with": "XMLHttpRequest"
        }

        let options = {
            method: 'POST',
            body: params,
            headers: headers
        };

        let resp = await fetch(raiseUrl, options);
        let res = await resp.json();

        if(res.modal) {
            let reg = new RegExp(`value="(.*?)"`, `g`);
            let regRes = [...res.modal.matchAll(reg)];

            regRes.forEach(id => {
                params.append('node_ids[]', id[1]);
            });

            options = {
                method: 'POST',
                body: params,
                headers: headers
            };

            resp = await fetch(raiseUrl, options);
            res = await resp.json();
        }

        return {success: true, msg: res.msg};
    } catch(err) {
        log(`Ошибка при поднятии предложений: ${err}`, 'r');
        return {success: false};
    }
}

function getNewTiming(msg) {
    const date = new Date();
    const now = date.getTime();

    if(!msg) return now + 60000; // 1 минута
    if(typeof msg == 'number') return now + msg;

    if(msg.includes('час')) {
        let num = getNumber(msg);
        if(num == null) return now + 1800000;
        return now + ((num - 1) * 3600000);
    }

    if(msg.includes('минут')) {
        let num = getNumber(msg);
        if(num == null) return now + 60000;
        return now + (num * 60000);
    }

    if(msg.includes('секунд')) {
        let num = getNumber(msg);
        if(num == null) return now + 30000;
        return now + (num * 1000);
    }

    return now + 60000;
}

function getNumber(string) {
    let r = /\d+/;
    let num = Number(string.match(r));

    if(isNaN(num) || num == 0) 
        return null;
    
    return num;
}

export { enableLotsRaise };