// Классификация операций по тексту выписки. Работает на устройстве.
(function(root){
var CATS = [
  // [название, цвет, правило]
  ['Продукты', '#5b7f5e', /PYATEROCH|Пятероч|DIXY|Дикси|LENTA|Лента|MAGNIT|Магнит|PEREK|Перекр|ROSAL|РосАл|VKUSVILL|AZBUKA|OKEY|PRODUKT|Продукт|MAGAZIN|Магазин|UPPETIT|APPETI|Аппетит|GASTRONOM|NOVOCHERKASSKAYASMA|НовочеркасскаяСМА|SAMOKAT|LAVKA|DOSTAVKA IZ|VERNYJ|ULYANKA|MERCURIY|STROITEL|ДЕУСФУД|Липовая|OOO VEND|ASP GRUPP|SEMISHAGOFF|Максым|MARKET B|Маркет_|^MARKET$|DFF SBP|MOP SBP|MISTOLOVO/i],
  ['Алкоголь и табак', '#8a5a44', /WINELAB|KRASNOE|KRASNOYE&|AROMATNYJ|GRADUSI|TABAK|TABACH|Табак|CHILL SMOKE|NORMAN|Норман|^AM( |_|$)|^АМ( |_|$)|GANG TABAK|Oblako Shop|TAURUS/i],
  ['Кафе и рестораны', '#c07a3e', /REST|KAFE|КАФЕ|COFFEE|KOFE|Kofe|COFIX|CAFE|BAR\b|BAR$|_BAR|MIRAGE|MAMA ROMA|TOKYO|MURASAKI|PUZATA|MANSARDA|NETMONET|Додо|DODO|BURGER|TEREMOK|SUBWAY|VKUSNO|Vkusno|SHAVERMA|STOLOVAYA|FOOD FACTORY|SUSHI|CHAJKHANA|DOSTAEVSKY|eatandsplit|Waffle|QSR|ecafe|OMOTENASHI|DYMNO|BUMBASTIK|CAMORRA|PACHA MAMA|KUKHNYA|STAFFBAR|ALIBI|FRANK|EVO_|_морж|СберЧаевые|EDARIT|YANDEX\*\d+\*EDA|Sharberry|SLADKO|Sufra|KONTAKT|ONTAP|CEKH|БЭК-ЯРД|FASOL|KHLEBNIK|XLEBNIK|PEKARN|Pekarn|BULOCHNAYA|LYUDI|Люди Любят|BUSHE|Буше|Bushe|LYUDILYUBYAT|GORYACHIE NAPITKI|BAGGINS|BEGGINS|TILI-TESTO|KEBAB|Bebra|OOODVOHTA|PRIOZERSKHLEB|ARBAT|NASHA PEKARNYA|LEGION|GOLIFUD|Гуудуу|RIMSKI|Rest /i],
  ['Такси', '#3f5f8a', /YANDEX\*\d+\*GO$|YANDEX\*\d+\*GO |YANDEX\*\d+\*TAXI|Yandex Go|YANDEX\*\d+\*GO\b(?!_)/i],
  ['Каршеринг', '#5a6f9e', /DRIVE|DELIMOBIL|BELKA|CITYDRIVE/i],
  ['Самокаты', '#6e8fb5', /WHOOSH|urent|SCOOTERS|ЮРЕНТ/i],
  ['Транспорт', '#7c8c99', /METRO|AVTOBUS|ELECTROTRANS|ELEKTROTRANS|Mos\.Transport|TRANS- ?BALT|DOMTRANSAVTO|YANDEX\*\d+\*BUS|VEST-SERVIS|OOO ARGO|GATCHINA Gatchina|BALTIJSKIJTCPDV|SPB UDELNYJ/i],
  ['Зарядки (аренда)', '#9aa36b', /BERI ?ZARYAD|RUNCHARG|BERIZA|GO_RUNCH|GO_BERIZA/i],
  ['Путешествия и жильё', '#4f8a86', /TUTU|Tutu|TRAVEL|Букинг|GOSTINICA|bilet\.nspk|AKVIDASERV|NOVOTEL/i],
  ['Сервисы Яндекса', '#b59a3c', /Сервисы Яндекса|YANDEX\*\d+\*(?!GO|TAXI|DRIVE|EDA|LAVKA|BUS|RUNCH|BERIZ|SCOOT|TRAVEL|MARKET|DELIVERY|DOSTAVKA)/i],
  ['Связь и интернет', '#6b7a8f', /Yota|MTS|MegaFon|МТС|Мегафон|Beeline|Tele2|VPN|vpnbot/i],
  ['Игры', '#7b5ea7', /Steam|steam|Battlepass|IGROMAGAZ|case-battle|ggsel|Gameparade|fowgame|wgames|upgrader|allforgamers|Tradeit|Digital Goods|plsttn|^ggs$|trdt|onyxsh|CYBER X|Letsfun|ideacores|iqmo|globalsteam|Skng/i],
  ['Покупки и маркетплейсы', '#a3647f', /OZON|Озон|AVITO|MARKET|Wildberries|WB |DNS|GOLD APPLE|PODRUZHKA|ULYBKA|УЛЫБКА|NEW YORKER|KARI|LINGERIE|DETSKIY|LEMANA|PETROVICH|SUNLIGHT|appyPC|kleekstore|Ohta Moll|Копирка|RUF PRO|ForeignPay|Bpay|bpay|RESURS|DELIVERY|DOSTAVKA|GUSLI/i],
  ['Цветы и подарки', '#c46b6b', /flowwow|CVETY|TSVETY|Цветы|FLOBYFLO|FLOWER/i],
  ['Развлечения', '#9b6fb0', /KASSIR|Afisha|СИНЕМА|Кинотеатр|KARO|MUSEUM|TERME|KRASNOYE OZERO|TVEL-SPORT|ARENA|WINLINE|SEVKABEL|CINEMA/i],
  ['Здоровье и красота', '#5f9e8f', /APTEKA|EAPTEKA|Аптека|ZDRAV|CLINIC/i],
  ['Авто и топливо', '#8d7b68', /AZS|GAZPROMNEFT|RNAZK|LUKOIL|ROSNEFT|ZAPRAVKI|Fuel|TATNEF/i],
  ['Госуслуги и налоги', '#6f6f6f', /GOSUSLUGI|Госуслуг|NALOG|Налоги и взносы/i],
  ['Комиссии банка', '#9a9a9a', /^Комиссия|^Плата за/i],
  ['Подписки', '#a08a4f', /^$/],
  ['Прочие покупки', '#b8b2a7', /.*/]
];
var COLORS = {}; CATS.forEach(function(c){ COLORS[c[0]] = c[1]; });
COLORS['Наличные'] = '#8f8a80'; COLORS['Переводы'] = '#4a4a4a';

var NICE = [
  [/WHOOSH/i, 'Whoosh (самокаты)'], [/urent/i, 'Юрент (самокаты)'], [/YANDEX\*\d+\*SCOOTERS/i, 'Яндекс самокаты'],
  [/YANDEX\*\d+\*(GO|TAXI)$|Yandex Go/i, 'Яндекс Go (такси)'], [/YANDEX\*\d+\*(GO_)?(RUNCH|BERIZ)/i, 'Яндекс — аренда зарядки'],
  [/YANDEX\*\d+\*DRIVE/i, 'Яндекс Драйв'], [/YANDEX\*\d+\*ZAPRAVKI|Yandex Fuel/i, 'Яндекс Заправки'], [/YANDEX\*\d+\*EDA/i, 'Яндекс Еда'], [/YANDEX\*\d+\*LAVKA/i, 'Яндекс Лавка'],
  [/YANDEX\*\d+\*MARKET/i, 'Яндекс Маркет'], [/YANDEX\*\d+\*TRAVEL/i, 'Яндекс Путешествия'], [/YANDEX\*\d+\*(DELIVERY|DOSTAVKA)/i, 'Яндекс Доставка'],
  [/SAMOKAT/i, 'Самокат (доставка)'], [/WINELAB|Winelab/i, 'Винлаб'], [/KRASNOE|KRASNOYE&/i, 'Красное&Белое'], [/PYATEROCH|Пятероч/i, 'Пятёрочка'],
  [/DIXY|Дикси/i, 'Дикси'], [/LENTA|Лента/i, 'Лента'], [/MAGNIT|Магнит/i, 'Магнит'], [/PEREK|Перекр/i, 'Перекрёсток'], [/DELIMOBIL/i, 'Делимобиль'],
  [/BERI ?ZARYAD/i, 'Бери заряд'], [/Steam/i, 'Steam'], [/OZON|Озон/i, 'Ozon'], [/^AVITO/i, 'Авито'], [/METRO TPP/i, 'Метро'], [/AVTOBUSNYJ/i, 'Автобус'],
  [/LYUDI ?LYUBYAT|Люди Любят/i, 'Люди любят (пекарня)'], [/KHLEBNIK/i, 'Хлебник'], [/BUSHE|Буше/i, 'Буше'], [/Додо|DODO/i, 'Додо Пицца'],
  [/Vkusno|VKUSNO/i, 'Вкусно — и точка'], [/NOVOCHERKASSKAYASMA|НовочеркасскаяСМА/i, 'Новочеркасская СМА'], [/ROSAL|РосАл/i, 'РосАл продукты'],
  [/Yota/i, 'Yota'], [/MTS/i, 'МТС'], [/MegaFon/i, 'МегаФон'], [/TUTU|Tutu/i, 'Туту.ру'], [/UPPETIT/i, 'Uppetit'], [/^AM( |_|$)|^АМ( |_|$)/, 'АМ']
];
function merchant(desc){
  var raw = merchantRaw(desc);
  for (var i = 0; i < NICE.length; i++) if (NICE[i][0].test(raw)) return NICE[i][1];
  return raw;
}
function merchantRaw(desc){
  return desc.replace(/ · .*$/, '').replace(/^(Оплата в|Оплата услуг|Отмена операции оплаты|Возврат средств по оплате|Возврат покупки через СБП)\s*/,'')
    .replace(/\s+(SANKT-?|Sankt|St Petersburg|ST PETERSBURG|MOSCOW|Moscow|Moskva|MOSKVA|G\. ?MOSKVA|g\. Moskva|G\.Moskva|SPb RUS|RUS$).*$/,'')
    .replace(/\s+RUS$/,'').trim() || desc;
}
function kindOf(d, amount){
  if (amount > 0){
    if (/^Отмена операции|^Возврат|диспутной/.test(d)) return 'refund';
    if (/кэшбэк|Кэшбэк/i.test(d)) return 'cashback';
    if (/^Внесение наличных|^Пополнение\. ATM/.test(d)) return 'cash_in';
    if (/^Перевод себе/.test(d)) return 'self';
    if (/Выплата за сделку|G2G|от организации|^Оплата от клиента/.test(d)) return 'income';
    return 'transfer_in';
  }
  if (/^Оплата в|^Оплата услуг/.test(d)) return 'purchase';
  if (/^Комиссия|^Плата за/.test(d)) return 'fee';
  if (/^Снятие наличных/.test(d)) return 'cash_out';
  if (/Инвесткопилк/.test(d)) return 'savings';
  if (/^Перевод себе/.test(d)) return 'self';
  return 'transfer_out';
}
function category(desc){
  var m = merchantRaw(desc);
  for (var i = 0; i < CATS.length; i++){ if (CATS[i][2].test(m) || CATS[i][2].test(desc)) return CATS[i][0]; }
  return 'Прочие покупки';
}
function counterparty(d){
  var m;
  if ((m = d.match(/^(?:Платёж|Поступление|Оплата от клиента): (.+?) · /))) return m[1];
  if (/^Оплата услуг Налоги и взносы/.test(d)) return 'Налоги и взносы';
  if (/^Комиссия банка/.test(d)) return 'Комиссии банка';
  if (/^Внесение наличных/.test(d)) return 'Наличные';
  if ((m = d.match(/номеру телефона\s*(\+?\d[\d\s-]{9,})/))) return 'Телефон ' + m[1].replace(/\s/g,'');
  if ((m = d.match(/договор[а]?\s+(\d{6,})/))) return 'Договор ' + m[1];
  if ((m = d.match(/карты\s+\d+\*+(\d{4})/))) return 'Карта ••' + m[1];
  if ((m = d.match(/счёт\s+\d*(\d{4}),?\s*(.*)$/))) return 'Счёт ••' + m[1] + (m[2] ? ' (' + m[2].replace(/ОТДЕЛЕНИЕ.*?ПАО /,'').trim() + ')' : '');
  if (/Система быстрых платежей|через СБП\. Перевод/.test(d)) return /организации/.test(d) ? 'Организация через СБП' : 'СБП — отправитель не указан';
  if (/Сбербанк Онлайн/.test(d)) return 'Сбербанк Онлайн — отправитель не указан';
  if (/Перевод себе/.test(d)) return 'Перевод себе';
  if (/на карту другого банка/.test(d)) return 'Карта другого банка';
  if (/Т-Банк$/.test(d)) return 'Т-Банк (внутренний)';
  if (/наличн|ATM/.test(d)) return 'Наличные';
  if (/Avito/.test(d)) return 'Авито — продажа';
  if (/G2G/.test(d)) return 'G2G Marketplace';
  return merchant(d);
}
var api = { CATS: CATS, COLORS: COLORS, merchant: merchant, kindOf: kindOf, category: category, counterparty: counterparty };
if (typeof module !== 'undefined') module.exports = api; else root.Cat = api;
})(this);
