import c from 'chalk';
import clone from 'clone';
import fetch from './fetch.js';
import { log } from './log.js';
import { parseDOM } from './DOMParser.js';
import { sendMessage, getNodeByUserName } from './chat.js';
import { load, updateFile, getConst } from './storage.js';

const goodsfilePath = 'data/autoIssueGoods.json';
const config = global.settings;
let goods = await load(goodsfilePath);
let backupOrders = [];

async function enableAutoIssue() {
    backupOrders = await getOrders();

    if(goods == undefined) {
        log(`Не удалось запустить автовыдачу, т.к. товары не были загружены.`, 'r');
        return false;
    }

    log(`Автовыдача запущена, загружено ${c.yellowBright(goods.length)} товара(ов).`);
}

async function checkForNewOrders() {
    try {
        let orders = [];

        log(`Проверяем на наличие новых заказов...`, 'c');
        orders = await getNewOrders(backupOrders);

        if(!orders || orders.newOrders.length == 0) {
            log(`Новых заказов нет.`, 'c');
            return;
        }

        for(let i = 0; i < orders.newOrders.length; i++) {
            const order = orders.newOrders[i];

            if(!order) {
                log('!order', 'c');
                return;
            }
    
            log(`Новый заказ ${c.yellowBright(order.id)} от покупателя ${c.yellowBright(order.buyerName)} на сумму ${c.yellowBright(order.price)} ₽.`);
            await issueGood(order.buyerId, order.buyerName, order.name, 'id');
        }
        
        backupOrders = clone(orders.backupOrders);
    } catch (err) {
        log(`Ошибка при автовыдаче: ${err}`, 'r');
    }
}

async function issueGood(buyerIdOrNode, buyerName, goodName, type = 'id') {
    let result = false;

    try {
        goods = await load(goodsfilePath);
        let message = "";
        
        for(let i = 0; i < goods.length; i++) {
            if(goodName.includes(goods[i].name)) {
                if(goods[i].message != undefined) {
                    message = goods[i].message;
                    break;
                } 
                else
                if(goods[i].nodes != undefined) {
                    let notInStock = true;

                    for(let j = 0; j < goods[i].nodes.length; j++) {
                        const node = goods[i].nodes[j];
    
                        goods[i].nodes.shift();
                        await updateFile(goods, goodsfilePath);
                        message = node;
                        notInStock = false;
                        break;
                    }

                    if(notInStock) {
                        log(`Похоже, товар "${goodName}" закончился, выдавать нечего.`);
                        return 'notInStock';
                    }
                }
            }
        }

        if(message != "") {
            let node = buyerIdOrNode;
            let customNode = false;

            if(type == 'id') {
                customNode = true;
            }
            
            result = await sendMessage(node, message, customNode);
            
            if(result) {
                log(`Товар "${c.yellowBright(goodName)}" выдан покупателю ${c.yellowBright(buyerName)} с сообщением:`);
                log(message);
            } else {
                log(`Не удалось отправить товар "${goodName}" покупателю ${buyerName}.`, 'r');
            }
        } else {
            log(`Товара "${c.yellowBright(goodName)}" нет в списке автовыдачи, пропускаю.`, 'y');
        }
    } catch (err) {
        log(`Ошибка при выдаче товара: ${err}`, 'r');
    }

    return result;
}

async function getGood(orderName) {
    let result = false;
    try {
        goods = await load(goodsfilePath);
    
        for(let i = 0; i < goods.length; i++) {
            if(orderName == goods[i].name) {
                result = goods[i];
                break;
            }
        }
    } catch (err) {
        log(`Ошибка при поиске заказов по нику: ${err}`, 'r');
    }

    return result;
}

async function addDeliveredName(orderName, name, orderId) {
    try {
        goods = await load(goodsfilePath);
        
        for(let i = 0; i < goods.length; i++) {
            if(orderName === goods[i].name) {
                if(goods[i].delivered == undefined) {
                    goods[i].delivered = [];
                }

                goods[i].delivered.push({
                    name: name, order: orderId
                });
                await updateFile(goods, goodsfilePath);
                break;
            }
        }
    } catch (err) {
        log(`Ошибка при записи новых ников к заказу: ${err}`, 'r');
    }
}

async function searchOrdersByUserName(userName) {
    let result = [];
    try {
        goods = await load(goodsfilePath);
    
        const orders = await getOrders();
    
        for(let i = 0; i < orders.length; i++) {
            if (orders[i].buyerName == userName) {
                result[result.length] = orders[i];
            }
        }
    } catch (err) {
        log(`Ошибка при поиске заказов по нику: ${err}`, 'r');
    }

    return result;
}

async function getNewOrders(lastOrders) {
    if(!lastOrders || !lastOrders[0]) {
        log(`Начальные данные по заказам не переданы`);
        return;
    }

    let result = [];
    let orders = [];

    try {
        orders = await getOrders();
        if(!orders || !orders[0]) {
            log(`Ошибка получения новых заказов: список заказов пуст.`, 'r');
            return;
        }

        for(let i = 0; i < orders.length; i++) {
            if(result.length >= 3) break;
            let contains = false;

            for(let j = 0; j < lastOrders.length; j++) {
                if(orders[i].id == lastOrders[j].id) {
                    contains = true;
                    break;
                }
            }

            if(contains == false) {
                result.push(Object.assign(orders[i]));
            }
        }
    } catch(err) {
        log(`Ошибка при получении новых заказов: ${err}`, 'r');
    }

    return {newOrders: result, backupOrders: orders};
}

async function getOrders() {
    let result = [];
    try {
        const url = `${getConst('api')}/orders/trade`;
        const headers = {
            "cookie": `golden_key=${config.token}`,
            "x-requested-with": "XMLHttpRequest"
        };

        const options = {
            method: 'POST',
            headers: headers
        }

        let resp = await fetch(url, options);
        
        const data = await resp.text();
        const doc = parseDOM(data);
        const ordersEl = doc.querySelectorAll(".tc-item");

        for(let i = 0; i < ordersEl.length; i++) {
            const order = ordersEl[i];
            const id = order.querySelector(".tc-order").innerHTML;
            const name = order.querySelector(".order-desc").firstElementChild.innerHTML;
            const buyerName = order.querySelector(".media-user-name > span").innerHTML;
            const buyerProfileLink = order.querySelector(".avatar-photo").dataset.href.split("/");
            const buyerId = buyerProfileLink[buyerProfileLink.length - 2];
            const status = order.querySelector(".tc-status").innerHTML;
            const price = Number(order.querySelector(".tc-price").firstChild.textContent);

            result.push({
                id: id,
                name: name,
                buyerId: buyerId,
                buyerName: buyerName,
                status: status,
                price: price
            });
        }

        return result;
    } catch (err) {
        log(`Ошибка при получении списка продаж: ${err}`, 'r');
    }
    return result;
}

export { getOrders, getNewOrders, issueGood, searchOrdersByUserName, checkForNewOrders, getGood, addDeliveredName, enableAutoIssue };