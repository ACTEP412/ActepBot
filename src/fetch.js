import fetch from 'node-fetch';
import proxy from 'https-proxy-agent';
import { exit, sleep } from './event.js';
import { log } from './log.js';

const settings = global.settings;
let requestsDelay = 0;
if(settings.requestsDelay) requestsDelay = settings.requestsDelay;

if(settings.proxy.useProxy == true) {
    if(!settings.proxy.type || !settings.proxy.host) {
        log(`Эу, это неверные данные прокси!`, 'r');
        await exit();
    }

    log(`Для обработки запросов используется ${settings.proxy.type} прокси: ${settings.proxy.host}`, 'g');
}

export default async function fetch_(url, options, delay = 0, retries = 20) {
    try {
        let tries = 1;

        if(settings.proxy.useProxy == true) {
            if(!options) options = {};
            let proxyString = '';

            if(settings.proxy.login || settings.proxy.pass) {
                proxyString = `${settings.proxy.type}://${settings.proxy.login}:${settings.proxy.pass}@${settings.proxy.host}:${settings.proxy.port}`;
            } else {
                proxyString = `${settings.proxy.type}://${settings.proxy.host}:${settings.proxy.port}`;
            }
            
            const agent = new proxy(proxyString);
            options.agent = agent;
        }

        delay += requestsDelay;
        await sleep(delay);

        let res = await fetch(url, options);

        while(!res.ok) {
            if(tries > retries) {
                log(`Превышено количество попыток запроса.`);
                log(`Request:`);
                log(options);
                log(`Response:`);
                log(res);
                break;
            };
            await sleep(2000 + requestsDelay);
            res = await fetch(url, options);
            tries++;
        }
    
        return res;
    } catch (err) {
        log(`Эй братан интернета нету! Я без интернета не могу ничего делать! (нет доступа к интернету / funpay): ${err}`);
        //return await fetch_(url, options, delay + 200, retries - 5);
    }
}