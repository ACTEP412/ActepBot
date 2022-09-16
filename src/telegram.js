import c from 'chalk';
import { Telegraf } from 'telegraf';
import { Keyboard } from 'telegram-keyboard';
import { setConst, load, updateFile, getConst } from './storage.js';
import { log } from './log.js';

class TelegramBot {
    constructor(token) {
        this.bot = new Telegraf(token);

        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }

    async run() {
        this.setupListeners();
        await this.setupBot();

        this.bot.launch();
        log(`Управление через telegram бота ${c.yellowBright(this.botInfo.username)} успешно запущено.`, 'g');
    }

    async setupBot() {
        this.botInfo = await this.bot.telegram.getMe();
        this.bot.options.username = this.botInfo.username;

        this.mainKeyboard = this.getMainKeyboard();
        this.editGoodsKeyboard = this.getEditGoodsKeyboard();
        this.selectIssueTypeKeyboard = this.getSelectIssueTypeKeyboard();
        this.backKeyboard = this.getBackKeyboard();

        this.waitingForLotDelete = true;
        this.waitingForLotName = false;
        this.waitingForLotContent = false;
        this.lotType = '';
        this.lotName = '';
        this.lotContent = '';
        this.products = [];
    }

    setupListeners() {
        this.bot.on('text', (ctx) => this.onMessage(ctx));
        this.bot.on('inline_query', (ctx) => this.onInlineQuery(ctx));
    }
    
    async onMessage(ctx) {
        try {
            const msg = ctx.update.message.text;

            if(!this.isUserAuthed(ctx) && msg == global.settings.token) {
                setConst('telegramUserName', ctx.update.message.from.username);
                ctx.reply('Я взломал тебя! Брат я шучу. Теперь ты авторизован и можешь управлять ботом.', this.mainKeyboard.reply());
                return;
            }
            
            if(!this.isUserAuthed(ctx)) {
                ctx.reply('Братан пришли мне golden_key, который ты вводил при настройке бота, чтобы начать работу.');
                return;
            }
    
            if(msg == 'Статус') {
                this.replyStatus(ctx);
                return;
            }
    
            if(msg == 'Редактировать автовыдачу') {
                this.editAutoIssue(ctx);
                return;
            }

            if(msg == 'Информация') {
                this.getInfo(ctx);
                return;
            }

            if(msg == 'Добавить товар') {
                this.addProduct(ctx);
                return;
            }

            if(msg == 'Удалить товар') {
                this.removeProduct(ctx);
                return;
            }

            if(msg == 'Выдача одного и того же текста. (Инструкция)') {
                this.lotType = 'instruction';
                this.addProductName(ctx);
                return;
            }

            if(msg == 'Выдача разных текстов по очереди. (Аккаунты') {
                this.lotType = 'accounts';
                this.addProductName(ctx);
                return;
            }

            if(msg == 'Получить файл автовыдачи для редактирования') {
                await this.getAutoIssueFile(ctx);
                return;
            }

            if(msg == 'Назад') {
                await this.back(ctx);
                return;
            }

            if(this.waitingForLotName) {
                await this.saveLotName(ctx);
                return;
            }

            if(this.waitingForLotContent) {
                await this.saveLotContent(ctx);
                return;
            }

            if(this.waitingForLotDelete) {
                await this.deleteLot(ctx);
                return;
            }

            this.waitingForLotName = false;
            this.waitingForLotContent = false;
            this.waitingForLotDelete = false;
            
            ctx.reply('Меню', this.mainKeyboard.reply());
        } catch (err) {
            log(`Ошибка при обработке telegram сообщения: ${err}`, 'r');
            ctx.reply(`Братан, я словил ошибку, исправь это! Вот что мне известно: ${err}`, this.mainKeyboard.reply());
        }
    }

    isUserAuthed(ctx) {
        if(global.settings.telegramUserName == ctx.update.message.from.username) return true;
        return false;
    }

    getMainKeyboard() {
        const keyboard = Keyboard.make([
            ['Статус'],
            ['Редактировать автовыдачу'],
            ['Информация']
        ]);

        return keyboard;
    }

    getEditGoodsKeyboard() {
        const keyboard = Keyboard.make([
            ['Добавить товар', 'Удалить товар'],
            ['Получить файл автовыдачи для редактирования'],
            ['Назад']
        ]);

        return keyboard;
    }

    getSelectIssueTypeKeyboard() {
        const keyboard = Keyboard.make([
            ['Выдача одного и того же текста (Инструкция)'],
            ['Выдача разных текстов по очереди (Аккаунты)'],
            ['Назад']
        ]);

        return keyboard;
    }

    getBackKeyboard() {
        const keyboard = Keyboard.make([
            ['Назад']
        ]);

        return keyboard;
    }

    async replyStatus(ctx) {
        const time = new Date().getTime();
        const difference = time - global.startTime;
        const workTime = new Date(difference).toISOString().slice(11, 19);

        const autoIssue = (global.settings.autoIssue) ? 'Вкл' : 'Выкл';
        const alwaysOnline = (global.settings.alwaysOnline) ? 'Вкл' : 'Выкл';
        const lotsRaise = (global.settings.lotsRaise) ? 'Вкл' : 'Выкл';
        const goodsStateCheck = (global.settings.goodsStateCheck) ? 'Вкл' : 'Выкл';
        const autoResponse = (global.settings.autoResponse) ? 'Вкл' : 'Выкл';

        const msg = `<b>Статус</b>\n\n🔑 Аккаунт: <code>${global.appData.userName}</code>\n🕒 Время работы: <code>${workTime}</code>\n⏲ Вечный онлайн: <code>${alwaysOnline}</code>\n👾 Автоответ: <code>${autoResponse}</code>\n🚀 Автовыдача: <code>${autoIssue}</code>\n🏆 Автоподнятие предложений: <code>${lotsRaise}</code>\n🔨 Автовосстановление предложений: <code>${goodsStateCheck}</code>\n\n<i>${global.settings.telegramUserName}</i>`;
        ctx.replyWithHTML(msg, this.mainKeyboard.reply());
    }

    async editAutoIssue(ctx) {
        try {
            const goods = await load('data/autoIssueGoods.json');
            let goodsStr = '';

            let msg = `<b>Список товаров</b>`;
            await ctx.replyWithHTML(msg, this.editGoodsKeyboard.reply());
    
            for(let i = 0; i < goods.length; i++) {
                goodsStr += `[${i + 1}] ${goods[i].name}\n`;
    
                if(goodsStr.length > 3000) {
                    await ctx.replyWithHTML(goodsStr, this.editGoodsKeyboard.reply());
                    goodsStr = '';
                }

                if(i == (goods.length - 1)) {
                    await ctx.replyWithHTML(goodsStr, this.editGoodsKeyboard.reply());
                }
            }
        } catch (err) {
            log(`Ошибка при выдаче списка товаров: ${err}`, 'r');
        }
    }

    getInfo(ctx) {
        const msg = `❔ <b>ActepBot</b> ❔\n\n<b>ActepBot</b> - это бот для funpay с открытым исходным кодом, разработанный <b>ArmenShop</b>.\n\n<a href="https://github.com/ACTEP412">GitHub</a> | <a href="https://github.com/ACTEP412"></a>`;
        ctx.replyWithHTML(msg);
    }

    addProduct(ctx) {
        ctx.replyWithHTML(`Выбери тип предложения`, this.selectIssueTypeKeyboard.reply());
    }

    addProductName(ctx) {
        ctx.replyWithHTML(`Отправь мне название предложения. Можешь просто скопировать его из funpay. Эмодзи в названии поддерживаются.`);
        this.waitingForLotName = true;
    }

    removeProduct(ctx) {
        ctx.replyWithHTML(`Введи номер товара, который нужно удалить из списка автовыдачи.`);
        this.waitingForLotDelete = true;
    }

    async back(ctx) {
        this.waitingForLotName = false;
        this.waitingForLotContent = false;
        this.waitingForLotDelete = false;

        if(this.products.length > 0) {
            let goods = await load('data/autoIssueGoods.json');

            const product = {
                "name": this.lotName,
                "nodes": this.products
            }

            goods.push(product);
            await updateFile(goods, 'data/autoIssueGoods.json');
            this.products = [];
        }

        ctx.reply('Меню', this.mainKeyboard.reply());
    }

    async saveLotName(ctx) {
        const msg = ctx.update.message.text;

        this.waitingForLotName = false;
        this.lotName = msg;

        let replyMessage = 'Понял. Теперь отправь мне сообщение, которое будет выдано покупателю после оплаты.';
        if(this.lotType == 'accounts') {
            replyMessage = 'Понял. Теперь отправь мне сообщение, которое будет выдано покупателю после оплаты. Ты можешь отправить несколько сообщений. Каждое сообщение будет выдано после каждой покупки. Нажми "Назад" когда закончишь заполнять товар.';
        }

        ctx.reply(replyMessage, this.backKeyboard.reply());
        this.waitingForLotContent = true;
    }

    async saveLotContent(ctx) {
        const msg = ctx.update.message.text;

        this.lotContent = msg;
        let keyboard = this.backKeyboard;
        let goods = await load('data/autoIssueGoods.json');

        if(this.lotType != 'accounts') {
            this.waitingForLotContent = false;
            keyboard = this.mainKeyboard;

            const product = {
                "name": this.lotName,
                "message": this.lotContent
            }
    
            goods.push(product);
            await updateFile(goods, 'data/autoIssueGoods.json');

            this.lotName = '';
            this.lotContent = '';
        } else {
            keyboard = this.backKeyboard;

            this.products.push(msg);
        }

        ctx.reply(`Братан, я сохранил товар.`, keyboard.reply());
    }

    async deleteLot(ctx) {
        const msg = ctx.update.message.text;
        this.waitingForLotDelete = false;

        let num = Number(msg);
        if(isNaN(num)) {
            ctx.reply(`Я тебя не понимать брат. Верну тебя в меню.`, this.mainKeyboard.reply());
            return;
        }

        let goods = await load('data/autoIssueGoods.json');
        if(num > goods.length || num < 0) {
            ctx.reply(`Такой цифры нету в списке автовыдачи. Верну тебя в меню.`, this.mainKeyboard.reply());
            return;
        }

        let name = goods[num - 1].name;
        goods.splice(num - 1, 1);
        await updateFile(goods, 'data/autoIssueGoods.json');

        ctx.reply(`Братан, я удалил товар "${name}" из списка автовыдачи.`, this.mainKeyboard.reply());
    }

    async getAutoIssueFile(ctx) {
        let contents = await getConst('autoIssueFilePath');

        ctx.replyWithDocument({
            source: contents,
            filename: 'autoIssueGoods.json'
        }).catch(function(error) { log(error); })
    }

    async onInlineQuery(ctx) {
        console.log(ctx);
    }
}

export default TelegramBot;
