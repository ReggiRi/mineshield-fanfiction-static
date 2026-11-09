(function (global) {
  'use strict';

  var DIRECTIONS = ['Слэш', 'Джен', 'Смешанная', 'Гет', 'Другие виды отношений', 'Фемслэш', 'Статья', 'Не определено'];
  var RATINGS = ['G', 'PG-13', 'R', 'NC-21', 'NC-17'];
  var STATUSES = ['Заморожен', 'Завершён', 'В процессе'];

  function stripBom(value) {
    return String(value == null ? '' : value).replace(/^\uFEFF/, '');
  }

  function detectDelimiter(text) {
    var lines = text.split(/\r?\n/);
    var first = '';
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim().length) { first = lines[i]; break; }
    }
    var tabs = (first.match(/\t/g) || []).length;
    var commas = (first.match(/,/g) || []).length;
    var semis = (first.match(/;/g) || []).length;
    if (tabs > 0 && tabs >= commas && tabs >= semis) return '\t';
    if (semis > commas && semis > tabs) return ';';
    return ',';
  }

  function parseDelimited(text, delimiter) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          row.push(field);
          field = '';
        } else if (ch === '\r') {
          /* skip */
        } else if (ch === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        } else {
          field += ch;
        }
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function normHeader(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .trim();
  }

  function findExact(header, name) {
    var target = String(name).trim().toLowerCase();
    for (var i = 0; i < header.length; i++) {
      if (String(header[i]).trim().toLowerCase() === target) return i;
    }
    return -1;
  }

  function looksLikeFicbookHeader(row) {
    var lower = row.map(function (c) { return String(c).trim().toLowerCase(); });
    return lower.indexOf('visit-link') >= 0 &&
      (lower.indexOf('hidden-xs') >= 0 || lower.indexOf('author') >= 0);
  }

  function looksLikeFicbookData(row) {
    var first = String(row[0] || '').trim();
    return /^https?:\/\//i.test(first) && /readfic|ficbook\.net/i.test(first) && row.length > 5;
  }

  function ficbookMap(header) {
    if (!header) {
      return { url: 0, title: 1, direction: 2, rating: 3, status: 4, likes: 5, authorUrl: 6, author: 7, date: -1, words: -1, pages: -1, parts: -1 };
    }
    var pick = function (name, fallback) {
      var i = findExact(header, name);
      return i >= 0 ? i : fallback;
    };
    return {
      url: pick('visit-link href', 0),
      title: pick('visit-link', 1),
      direction: pick('hidden-xs', 2),
      rating: pick('ds-label', 3),
      status: pick('ds-label (2)', 4),
      likes: pick('js-like-count', 5),
      authorUrl: pick('author href', 6),
      author: pick('author', 7),
      date: -1,
      words: -1,
      pages: -1,
      parts: -1
    };
  }

  var ALIASES = {
    url: ['url', 'ссылка', 'link', 'ссылка на работу', 'ссылка на фик', 'адрес'],
    title: ['название', 'название работы', 'title', 'работа', 'фанфик', 'фик'],
    author: ['автор', 'авторы', 'author'],
    authorUrl: ['ссылка на автора', 'author url', 'профиль автора'],
    direction: ['направленность', 'направление', 'direction', 'категория', 'тип отношений', 'вид отношений'],
    rating: ['рейтинг', 'rating'],
    status: ['статус', 'status', 'состояние'],
    date: ['дата', 'date', 'дата завершения', 'дата обновления', 'дата создания', 'дата публикации', 'дата последнего обновления'],
    likes: ['лайки', 'likes', 'сердечки'],
    words: ['слов', 'слова', 'слово', 'words', 'количество слов', 'кол во слов', 'число слов'],
    pages: ['страниц', 'страницы', 'страница', 'pages', 'количество страниц', 'число страниц'],
    parts: ['частей', 'части', 'часть', 'parts', 'количество частей', 'число частей'],
    size: ['размер', 'size']
  };

  function genericMap(header) {
    var norms = header.map(normHeader);
    var map = {};
    Object.keys(ALIASES).forEach(function (key) {
      var aliases = ALIASES[key].map(normHeader).filter(Boolean);
      var index = -1;
      for (var i = 0; i < norms.length; i++) {
        if (aliases.indexOf(norms[i]) >= 0) { index = i; break; }
      }
      if (index < 0) {
        for (var j = 0; j < norms.length && index < 0; j++) {
          var h = norms[j];
          if (!h) continue;
          for (var k = 0; k < aliases.length; k++) {
            var a = aliases[k];
            if (h.indexOf(a) >= 0 || (a.length > 3 && a.indexOf(h) >= 0)) { index = j; break; }
          }
        }
      }
      map[key] = index;
    });
    return map;
  }

  function parseDate(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return null;
    var m = text.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);
    if (m) {
      var day = parseInt(m[1], 10);
      var month = parseInt(m[2], 10);
      var year = parseInt(m[3], 10);
      if (year < 100) year += 2000;
      return makeDate(year, month, day);
    }
    m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (m) {
      return makeDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
    }
    return null;
  }

  function makeDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function findDateInRow(row, startIndex) {
    for (var i = startIndex || 0; i < row.length; i++) {
      var date = parseDate(row[i]);
      if (date) return date;
    }
    return null;
  }

  function findDateType(row) {
    for (var i = 0; i < row.length; i++) {
      var text = String(row[i] == null ? '' : row[i]);
      if (/дата\s+заверш/i.test(text)) return 'finish';
      if (/дата\s+обновл/i.test(text)) return 'update';
      if (/дата\s+создан/i.test(text)) return 'create';
      if (/дата\s+публик/i.test(text)) return 'publication';
    }
    return null;
  }

  function numberBefore(text, wordPattern) {
    var re = new RegExp('(\\d[\\d\\s\\u00a0\\u202f]{0,15})\\s*(?:' + wordPattern + ')(?![а-яА-ЯёЁ])', 'i');
    var m = String(text).match(re);
    if (!m) return null;
    var digits = m[1].replace(/[\s\u00a0\u202f]/g, '');
    var n = parseInt(digits, 10);
    return isFinite(n) ? n : null;
  }

  function extractSize(text) {
    var words = numberBefore(text, 'слово|слова|слов');
    var pages = numberBefore(text, 'страница|страницы|страниц');
    var parts = numberBefore(text, 'часть|части|частей');
    return {
      words: words,
      pages: pages,
      parts: parts,
      raw: String(text == null ? '' : text).trim() || null
    };
  }

  function parseNum(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return null;
    var digits = text.replace(/[^\d]/g, '');
    if (!digits) return null;
    var n = parseInt(digits, 10);
    return isFinite(n) ? n : null;
  }

  function normalizeStatus(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return 'Не указан';
    if (/замороз/i.test(text)) return 'Заморожен';
    if (/заверш/i.test(text)) return 'Завершён';
    if (/процесс/i.test(text)) return 'В процессе';
    return text;
  }

  function normalizeDirection(value) {
    var text = String(value == null ? '' : value).trim();
    return text || 'Не определено';
  }

  function normalizeRating(value) {
    return String(value == null ? '' : value).trim().toUpperCase().replace(/\s+/g, '');
  }

  function get(row, index) {
    if (index < 0 || index >= row.length) return '';
    return String(row[index] == null ? '' : row[index]).trim();
  }

  function findUrl(row) {
    for (var i = 0; i < row.length; i++) {
      var text = String(row[i] == null ? '' : row[i]).trim();
      if (/^https?:\/\//i.test(text) && /readfic|ficbook\.net/i.test(text)) return text;
    }
    for (var j = 0; j < row.length; j++) {
      var t = String(row[j] == null ? '' : row[j]).trim();
      if (/^https?:\/\//i.test(t)) return t;
    }
    return '';
  }

  function parseWork(row, map, options) {
    options = options || {};
    var scanStart = options.scanStart || 0;

    var url = get(row, map.url) || findUrl(row);
    var title = get(row, map.title);
    if (!title) {
      for (var i = 0; i < row.length; i++) {
        var candidate = get(row, i);
        if (candidate && candidate !== url && !/^https?:\/\//i.test(candidate)) { title = candidate; break; }
      }
    }
    if (!title) title = '(без названия)';

    var author = get(row, map.author) || 'Без автора';
    var authorUrl = get(row, map.authorUrl);

    var date = null;
    if (map.date >= 0) date = parseDate(get(row, map.date));
    if (!date) date = findDateInRow(row, Math.min(scanStart, row.length));
    if (!date) date = findDateInRow(row, 0);
    var dateType = findDateType(row);

    var size = { words: null, pages: null, parts: null, raw: null };
    if (map.words >= 0 || map.pages >= 0 || map.parts >= 0) {
      size.words = parseNum(get(row, map.words));
      size.pages = parseNum(get(row, map.pages));
      size.parts = parseNum(get(row, map.parts));
      var partsText = [get(row, map.words), get(row, map.pages), get(row, map.parts)].filter(Boolean).join(', ');
      if (partsText) size.raw = partsText;
    }
    if (size.words == null && size.pages == null && size.parts == null) {
      for (var j = scanStart; j < row.length; j++) {
        var cell = String(row[j] == null ? '' : row[j]);
        if (/страниц|слов|част|планируется/i.test(cell)) {
          var parsed = extractSize(cell);
          if (parsed.words != null || parsed.pages != null || parsed.parts != null) {
            size = parsed;
            break;
          }
        }
      }
    }

    return {
      id: options.id,
      url: url,
      title: title,
      direction: normalizeDirection(get(row, map.direction)),
      rating: normalizeRating(get(row, map.rating)),
      status: normalizeStatus(get(row, map.status)),
      likes: parseNum(get(row, map.likes)),
      author: author,
      authorUrl: authorUrl,
      date: date,
      dateType: dateType,
      words: size.words,
      pages: size.pages,
      parts: size.parts,
      sizeRaw: size.raw
    };
  }

  function parseTable(input) {
    var text = stripBom(input).trim();
    var warnings = [];
    if (!text) {
      return { works: [], warnings: ['Пустой ввод — вставьте таблицу или загрузите файл.'], format: null, delimiter: null, totalRows: 0 };
    }

    var delimiter = detectDelimiter(text);
    var rows = parseDelimited(text, delimiter).filter(function (row) {
      return row.some(function (cell) { return String(cell).trim().length > 0; });
    });

    if (!rows.length) {
      return { works: [], warnings: ['В таблице нет строк с данными.'], format: null, delimiter: delimiter, totalRows: 0 };
    }

    var format;
    var map;
    var dataRows;
    var scanStart;

    if (looksLikeFicbookHeader(rows[0])) {
      format = 'ficbook';
      map = ficbookMap(rows[0]);
      dataRows = rows.slice(1);
      scanStart = 8;
    } else if (looksLikeFicbookData(rows[0])) {
      format = 'ficbook';
      map = ficbookMap(null);
      dataRows = rows;
      scanStart = 8;
      warnings.push('Заголовок не найден — данные прочитаны по стандартным позициям выгрузки ficbook.');
    } else {
      format = 'generic';
      map = genericMap(rows[0]);
      dataRows = rows.slice(1);
      scanStart = 0;
      if (map.title < 0 && map.author < 0 && map.direction < 0 && map.rating < 0 && map.status < 0) {
        warnings.push('Не удалось распознать колонки заголовка. Проверьте, что первая строка содержит названия столбцов.');
      }
    }

    var works = [];
    var skippedNoDate = 0;
    var skippedEmpty = 0;

    for (var i = 0; i < dataRows.length; i++) {
      var row = dataRows[i];
      var hasContent = row.some(function (cell) { return String(cell).trim().length > 0; });
      if (!hasContent) continue;
      var work = parseWork(row, map, { id: works.length, scanStart: scanStart });
      var urlMissing = !work.url;
      var titleMissing = !work.title || work.title === '(без названия)';
      if (urlMissing && titleMissing) {
        skippedEmpty++;
        continue;
      }
      if (!work.date) skippedNoDate++;
      works.push(work);
    }

    if (skippedNoDate > 0) {
      warnings.push('Работ без распознанной даты: ' + skippedNoDate + '. Они не попадут в статистику по периоду.');
    }
    if (skippedEmpty > 0) {
      warnings.push('Пропущено пустых/нераспознанных строк: ' + skippedEmpty + '.');
    }
    if (!works.length) {
      warnings.push('Не удалось прочитать ни одной работы.');
    }

    return {
      works: works,
      warnings: warnings,
      format: format,
      delimiter: delimiter,
      totalRows: dataRows.length
    };
  }

  var api = {
    parseTable: parseTable,
    parseDelimited: parseDelimited,
    detectDelimiter: detectDelimiter,
    parseDate: parseDate,
    DIRECTIONS: DIRECTIONS,
    RATINGS: RATINGS,
    STATUSES: STATUSES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.FicParser = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
