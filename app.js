(function () {
  'use strict';

  var P = window.FicParser;
  var DIRECTIONS = P.DIRECTIONS;
  var RATINGS = P.RATINGS;
  var STATUSES = P.STATUSES;

  var numberFormat = new Intl.NumberFormat('ru-RU');

  function fmt(value) {
    return numberFormat.format(Number(value) || 0);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtDate(date) {
    if (!date) return '—';
    return pad2(date.getDate()) + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear();
  }

  function toInputValue(date) {
    if (!date) return '';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function parseInputDate(value) {
    if (!value) return null;
    var parts = value.split('-');
    if (parts.length !== 3) return null;
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var day = parseInt(parts[2], 10);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function authorKey(work) {
    return work.authorUrl || ('name:' + String(work.author).toLowerCase());
  }

  function workLink(work) {
    var title = esc(work.title);
    if (/^https?:\/\//i.test(work.url)) {
      return '<a href="' + esc(work.url) + '" target="_blank" rel="noopener noreferrer">' + title + '</a>';
    }
    return '<span>' + title + '</span>';
  }

  function authorLink(work) {
    var name = esc(work.author);
    if (/^https?:\/\//i.test(work.authorUrl)) {
      return '<a href="' + esc(work.authorUrl) + '" target="_blank" rel="noopener noreferrer">' + name + '</a>';
    }
    return name;
  }

  var el = {
    raw: document.getElementById('raw-input'),
    file: document.getElementById('file-input'),
    choose: document.getElementById('choose-file'),
    parse: document.getElementById('parse-btn'),
    reset: document.getElementById('reset-btn'),
    parseStatus: document.getElementById('parse-status'),
    dataInfo: document.getElementById('data-info'),
    periodCard: document.getElementById('period-card'),
    start: document.getElementById('start-date'),
    end: document.getElementById('end-date'),
    process: document.getElementById('process-btn'),
    periodStatus: document.getElementById('period-status'),
    reviewCard: document.getElementById('review-card'),
    reviewList: document.getElementById('review-list'),
    reviewInfo: document.getElementById('review-info'),
    selectAll: document.getElementById('select-all'),
    selectNone: document.getElementById('select-none'),
    excludedCard: document.getElementById('excluded-card'),
    excludedBefore: document.getElementById('excluded-before'),
    stats: document.getElementById('stats'),
    summary: document.getElementById('summary'),
    multiAuthors: document.getElementById('multi-authors'),
    byDirection: document.getElementById('by-direction'),
    byRating: document.getElementById('by-rating'),
    byStatus: document.getElementById('by-status'),
    completedParts: document.getElementById('completed-parts'),
    completedLength: document.getElementById('completed-length'),
    includedList: document.getElementById('included-list'),
    copy: document.getElementById('copy-report'),
    reportStatus: document.getElementById('report-status')
  };

  var state = {
    works: [],
    minDate: null,
    maxDate: null,
    start: null,
    end: null,
    before: [],
    within: [],
    after: [],
    afterSelected: new Set(),
    included: [],
    noDate: []
  };

  function setStatus(node, kind, html) {
    node.className = 'status' + (kind ? ' ' + kind : '');
    node.innerHTML = html || '';
  }

  function resetProcessing() {
    state.start = null;
    state.end = null;
    state.before = [];
    state.within = [];
    state.after = [];
    state.afterSelected = new Set();
    state.included = [];
    state.noDate = [];
    el.reviewCard.hidden = true;
    el.excludedCard.hidden = true;
    el.stats.hidden = true;
    el.reviewList.innerHTML = '';
    el.reviewInfo.textContent = '';
    el.excludedBefore.innerHTML = '';
    el.periodStatus.className = 'status';
    el.periodStatus.innerHTML = '';
    el.reportStatus.textContent = '';
    el.summary.innerHTML = '';
    el.multiAuthors.innerHTML = '';
    el.byDirection.innerHTML = '';
    el.byRating.innerHTML = '';
    el.byStatus.innerHTML = '';
    el.completedParts.innerHTML = '';
    el.completedLength.innerHTML = '';
    el.includedList.innerHTML = '';
  }

  function parseInput() {
    var result = P.parseTable(el.raw.value);
    state.works = result.works;
    resetProcessing();
    el.parseStatus.className = 'status';
    el.parseStatus.innerHTML = '';
    el.dataInfo.textContent = '';

    if (!result.works.length) {
      setStatus(el.parseStatus, 'error', esc(result.warnings.join(' ')) || 'Не удалось распознать таблицу.');
      el.periodCard.hidden = true;
      return;
    }

    var dates = result.works.filter(function (w) { return w.date; }).map(function (w) { return w.date.getTime(); });
    state.minDate = dates.length ? new Date(Math.min.apply(null, dates)) : null;
    state.maxDate = dates.length ? new Date(Math.max.apply(null, dates)) : null;

    if (result.warnings.length) {
      setStatus(el.parseStatus, 'warn', '<strong>Распознано работ: ' + fmt(result.works.length) + '.</strong> Замечания:<ul>' +
        result.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>');
    } else {
      setStatus(el.parseStatus, 'ok', 'Распознано работ: ' + fmt(result.works.length) + '.');
    }

    var info = [];
    if (state.minDate && state.maxDate) {
      info.push('Даты в таблице: ' + fmtDate(state.minDate) + ' — ' + fmtDate(state.maxDate) + '.');
    }
    if (result.format === 'ficbook') info.push('Формат: выгрузка ficbook.');
    el.dataInfo.textContent = info.join(' ');

    el.periodCard.hidden = false;
    if (state.minDate) el.start.value = toInputValue(state.minDate);
    if (state.maxDate) el.end.value = toInputValue(state.maxDate);
  }

  function processPeriod() {
    if (!state.works.length) {
      setStatus(el.periodStatus, 'error', 'Сначала разберите таблицу.');
      return;
    }
    var start = parseInputDate(el.start.value);
    var end = parseInputDate(el.end.value);
    if (!start || !end) {
      setStatus(el.periodStatus, 'error', 'Укажите начало и конец промежутка.');
      return;
    }
    if (start.getTime() > end.getTime()) {
      setStatus(el.periodStatus, 'error', 'Начало периода позже его конца.');
      return;
    }

    state.start = start;
    state.end = end;
    state.before = [];
    state.within = [];
    state.after = [];
    state.noDate = [];

    var from = start.getTime();
    var to = end.getTime();

    state.works.forEach(function (work) {
      if (!work.date) { state.noDate.push(work); return; }
      var t = work.date.getTime();
      if (t < from) state.before.push(work);
      else if (t > to) state.after.push(work);
      else state.within.push(work);
    });

    state.after.sort(function (a, b) {
      return (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0) ||
        a.title.localeCompare(b.title, 'ru');
    });
    state.afterSelected = new Set();

    renderReview();
    renderExcluded();

    el.reviewCard.hidden = state.after.length === 0;
    el.excludedCard.hidden = state.before.length === 0;
    el.stats.hidden = false;

    var message = 'Внутри периода: <strong>' + fmt(state.within.length) + '</strong>. ' +
      'Убрано до начала: <strong>' + fmt(state.before.length) + '</strong>. ' +
      'Позже периода: <strong>' + fmt(state.after.length) + '</strong>.';
    if (state.noDate.length) {
      message += ' Без даты (не учитываются): <strong>' + fmt(state.noDate.length) + '</strong>.';
    }
    setStatus(el.periodStatus, 'ok', message);

    recompute();
  }

  function renderReview() {
    if (!state.after.length) {
      el.reviewList.innerHTML = '';
      return;
    }
    el.reviewList.innerHTML = state.after.map(function (work) {
      var checked = state.afterSelected.has(work.id) ? ' checked' : '';
      var meta = [
        esc(work.author),
        fmtDate(work.date),
        esc(work.status),
        esc(work.direction),
        esc(work.rating)
      ].filter(Boolean).join(' · ');
      return '<label class="review-item">' +
        '<input type="checkbox" data-work-id="' + work.id + '"' + checked + '>' +
        '<span class="review-title">' + workLink(work) + '</span>' +
        '<span class="review-meta">' + meta + '</span>' +
        '</label>';
    }).join('');
  }

  function renderExcluded() {
    if (!state.before.length) {
      el.excludedBefore.innerHTML = '';
      return;
    }
    var sorted = state.before.slice().sort(function (a, b) {
      return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0);
    });
    el.excludedBefore.innerHTML =
      '<p class="note">Убрано работ: <strong>' + fmt(sorted.length) + '</strong> — они раньше начала периода.</p>' +
      '<ul class="excluded-list">' + sorted.map(function (work) {
        return '<li>' + workLink(work) + ' — ' + esc(work.author) + ', ' + fmtDate(work.date) +
          ', ' + esc(work.status) + '</li>';
      }).join('') + '</ul>';
  }

  function recompute() {
    var kept = state.after.filter(function (work) { return state.afterSelected.has(work.id); });
    state.included = state.within.concat(kept);
    el.reviewInfo.textContent = 'Оставлено после периода: ' + kept.length + ' из ' + state.after.length;
    renderStats(computeStats(state.included));
  }

  function groupCounts(works, getter) {
    var map = new Map();
    works.forEach(function (work) {
      var key = getter(work);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }

  function computeStats(works) {
    var uniqueAuthors = new Set(works.map(authorKey));

    var authorMap = new Map();
    works.forEach(function (work) {
      var key = authorKey(work);
      if (!authorMap.has(key)) {
        authorMap.set(key, { name: work.author, url: work.authorUrl, count: 0 });
      }
      authorMap.get(key).count += 1;
    });
    var multiAuthors = Array.from(authorMap.values())
      .filter(function (a) { return a.count > 1; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'ru'); });

    var dirMap = groupCounts(works, function (w) { return w.direction; });
    var directions = DIRECTIONS.map(function (label) { return { label: label, count: dirMap.get(label) || 0 }; });
    var dirOthers = Array.from(dirMap.entries()).filter(function (entry) { return DIRECTIONS.indexOf(entry[0]) < 0; });

    var ratingMap = groupCounts(works, function (w) { return w.rating; });
    var ratings = RATINGS.map(function (label) { return { label: label, count: ratingMap.get(label) || 0 }; });
    var ratingOthers = Array.from(ratingMap.entries()).filter(function (entry) { return RATINGS.indexOf(entry[0]) < 0; });

    var statusMap = groupCounts(works, function (w) { return w.status; });
    var statuses = STATUSES.map(function (label) { return { label: label, count: statusMap.get(label) || 0 }; });
    var statusOthers = Array.from(statusMap.entries()).filter(function (entry) { return STATUSES.indexOf(entry[0]) < 0; });

    var completed = works.filter(function (w) { return w.status === 'Завершён'; });
    var onePart = completed.filter(function (w) { return w.parts === 1; });
    var multiPart = completed.filter(function (w) { return w.parts != null && w.parts >= 2; });
    var unknownParts = completed.filter(function (w) { return w.parts == null; });

    var words = completed.reduce(function (sum, w) { return sum + (w.words || 0); }, 0);
    var pages = completed.reduce(function (sum, w) { return sum + (w.pages || 0); }, 0);
    var missingWords = completed.filter(function (w) { return w.words == null; }).length;
    var missingPages = completed.filter(function (w) { return w.pages == null; }).length;

    return {
      total: works.length,
      uniqueAuthors: uniqueAuthors.size,
      multiAuthors: multiAuthors,
      directions: directions,
      dirOthers: dirOthers,
      ratings: ratings,
      ratingOthers: ratingOthers,
      statuses: statuses,
      statusOthers: statusOthers,
      completed: {
        total: completed.length,
        onePart: onePart.length,
        multiPart: multiPart.length,
        unknownParts: unknownParts.length,
        words: words,
        pages: pages,
        missingWords: missingWords,
        missingPages: missingPages
      }
    };
  }

  function countList(entries) {
    return '<ul class="stat-list">' + entries.map(function (entry) {
      return '<li><span>' + esc(entry.label) + '</span><span class="num">' + fmt(entry.count) + '</span></li>';
    }).join('') + '</ul>';
  }

  function othersNote(entries) {
    if (!entries.length) return '';
    var text = entries.map(function (entry) {
      return esc(entry[0] || 'Не указано') + ' — ' + fmt(entry[1]);
    }).join(', ');
    return '<p class="note">Прочее: ' + text + '.</p>';
  }

  function summaryCard(value, label) {
    return '<div class="summary-card"><div class="summary-value">' + value + '</div>' +
      '<div class="summary-label">' + esc(label) + '</div></div>';
  }

  function renderStats(stats) {
    if (!stats.total) {
      el.summary.innerHTML = '<p class="empty">В выбранный промежуток не попало ни одной работы.</p>';
      el.multiAuthors.innerHTML = '<p class="empty">Нет данных.</p>';
      el.byDirection.innerHTML =
        '<p class="empty">Нет данных.</p>';
      el.byRating.innerHTML = '<p class="empty">Нет данных.</p>';
      el.byStatus.innerHTML = '<p class="empty">Нет данных.</p>';
      el.completedParts.innerHTML = '<p class="empty">Нет данных.</p>';
      el.completedLength.innerHTML = '<p class="empty">Нет данных.</p>';
      el.includedList.innerHTML = '<p class="empty">Нет работ.</p>';
      return;
    }

    el.summary.innerHTML = [
      summaryCard(fmt(stats.total), 'Фанфиков'),
      summaryCard(fmt(stats.uniqueAuthors), 'Уникальных авторов'),
      summaryCard(fmt(stats.completed.total), 'Завершённых'),
      summaryCard(fmt(stats.completed.words), 'Слов в завершённых'),
      summaryCard(fmt(stats.completed.pages), 'Страниц в завершённых')
    ].join('');

    if (!stats.multiAuthors.length) {
      el.multiAuthors.innerHTML = '<p class="empty">Нет авторов с более чем одной работой.</p>';
    } else {
      el.multiAuthors.innerHTML = '<table class="authors"><thead><tr><th>Автор</th><th class="num">Работ</th></tr></thead><tbody>' +
        stats.multiAuthors.map(function (author) {
          var name = esc(author.name);
          if (/^https?:\/\//i.test(author.url)) {
            name = '<a href="' + esc(author.url) + '" target="_blank" rel="noopener noreferrer">' + name + '</a>';
          }
          return '<tr><td>' + name + '</td><td class="num">' + fmt(author.count) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    el.byDirection.innerHTML = countList(stats.directions) + othersNote(stats.dirOthers);
    el.byRating.innerHTML = countList(stats.ratings) + othersNote(stats.ratingOthers);
    el.byStatus.innerHTML = countList(stats.statuses) + othersNote(stats.statusOthers);

    var completed = [
      { label: 'В одну часть', count: stats.completed.onePart },
      { label: 'В две и более частей', count: stats.completed.multiPart }
    ];
    var partsNote = stats.completed.unknownParts
      ? '<p class="note">Частей не указано: ' + fmt(stats.completed.unknownParts) + '.</p>'
      : '';
    el.completedParts.innerHTML = countList(completed) + partsNote;

    var lengthNote = [];
    if (stats.completed.missingWords) {
      lengthNote.push('в сумму слов не входят работы без данных о словах: ' + fmt(stats.completed.missingWords));
    }
    if (stats.completed.missingPages) {
      lengthNote.push('в сумму страниц не входят работы без данных о страницах: ' + fmt(stats.completed.missingPages));
    }
    el.completedLength.innerHTML = countList([
      { label: 'Слов', count: stats.completed.words },
      { label: 'Страниц', count: stats.completed.pages }
    ]) + (lengthNote.length ? '<p class="note">' + lengthNote.join('; ') + '.</p>' : '');

    var sorted = state.included.slice().sort(function (a, b) {
      return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0) ||
        a.title.localeCompare(b.title, 'ru');
    });
    el.includedList.innerHTML = '<details class="works"><summary>Список вошедших работ (' + fmt(sorted.length) + ')</summary>' +
      '<ul class="included-list">' + sorted.map(function (work) {
        var meta = [
          esc(work.author),
          fmtDate(work.date),
          esc(work.status),
          esc(work.direction),
          esc(work.rating),
          work.words != null ? fmt(work.words) + ' слов' : null,
          work.pages != null ? fmt(work.pages) + ' стр.' : null,
          work.parts != null ? fmt(work.parts) + ' ч.' : null
        ].filter(Boolean).join(' · ');
        return '<li><span class="work-title">' + workLink(work) + '</span>' +
          '<span class="work-meta">' + meta + '</span></li>';
      }).join('') + '</ul></details>';
  }

  function buildReport() {
    var stats = computeStats(state.included);
    var lines = [];
    lines.push('Статистика фанфиков');
    if (state.start && state.end) {
      lines.push('Период: ' + fmtDate(state.start) + ' — ' + fmtDate(state.end));
    }
    var keptAfter = state.after.filter(function (w) { return state.afterSelected.has(w.id); }).length;
    lines.push('Вошло работ: ' + stats.total + ' (внутри периода: ' + state.within.length +
      '; оставлено после периода: ' + keptAfter + ' из ' + state.after.length + ')');
    if (state.noDate.length) lines.push('Без даты и не учтено: ' + state.noDate.length);
    lines.push('');
    lines.push('Фанфиков: ' + stats.total);
    lines.push('Уникальных авторов: ' + stats.uniqueAuthors);
    lines.push('');
    lines.push('Авторы с более чем одной работой:');
    if (!stats.multiAuthors.length) {
      lines.push('- нет');
    } else {
      stats.multiAuthors.forEach(function (author) {
        lines.push('- ' + author.name + ' — ' + author.count);
      });
    }
    lines.push('');
    lines.push('По направленности:');
    stats.directions.forEach(function (entry) { lines.push('- ' + entry.label + ': ' + entry.count); });
    if (stats.dirOthers.length) {
      stats.dirOthers.forEach(function (entry) { lines.push('- ' + (entry[0] || 'Не указано') + ': ' + entry[1]); });
    }
    lines.push('');
    lines.push('По рейтингу:');
    stats.ratings.forEach(function (entry) { lines.push('- ' + entry.label + ': ' + entry.count); });
    if (stats.ratingOthers.length) {
      stats.ratingOthers.forEach(function (entry) { lines.push('- ' + (entry[0] || 'Не указано') + ': ' + entry[1]); });
    }
    lines.push('');
    lines.push('По статусу:');
    stats.statuses.forEach(function (entry) { lines.push('- ' + entry.label + ': ' + entry.count); });
    if (stats.statusOthers.length) {
      stats.statusOthers.forEach(function (entry) { lines.push('- ' + (entry[0] || 'Не указано') + ': ' + entry[1]); });
    }
    lines.push('');
    lines.push('Завершённые работы:');
    lines.push('- В одну часть: ' + stats.completed.onePart);
    lines.push('- В две и более частей: ' + stats.completed.multiPart);
    if (stats.completed.unknownParts) lines.push('- Частей не указано: ' + stats.completed.unknownParts);
    lines.push('');
    lines.push('Общая длина завершённых работ:');
    lines.push('- Слов: ' + fmt(stats.completed.words));
    lines.push('- Страниц: ' + fmt(stats.completed.pages));
    if (stats.completed.missingWords) {
      lines.push('- Работ без данных о словах (не в сумме): ' + stats.completed.missingWords);
    }
    if (stats.completed.missingPages) {
      lines.push('- Работ без данных о страницах (не в сумме): ' + stats.completed.missingPages);
    }
    return lines.join('\n');
  }

  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (err) { /* ignore */ }
    document.body.removeChild(area);
  }

  function copyReport() {
    var text = buildReport();
    var done = function () {
      el.reportStatus.textContent = 'Отчёт скопирован';
      window.setTimeout(function () { el.reportStatus.textContent = ''; }, 2500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  el.parse.addEventListener('click', parseInput);
  el.process.addEventListener('click', processPeriod);
  el.copy.addEventListener('click', copyReport);

  el.choose.addEventListener('click', function () { el.file.click(); });

  el.file.addEventListener('change', function () {
    var file = el.file.files && el.file.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      el.raw.value = String(reader.result || '');
      parseInput();
    };
    reader.onerror = function () {
      setStatus(el.parseStatus, 'error', 'Не удалось прочитать файл.');
    };
    reader.readAsText(file, 'utf-8');
  });

  el.reset.addEventListener('click', function () {
    el.raw.value = '';
    el.file.value = '';
    state.works = [];
    state.minDate = null;
    state.maxDate = null;
    el.parseStatus.className = 'status';
    el.parseStatus.innerHTML = '';
    el.dataInfo.textContent = '';
    el.start.value = '';
    el.end.value = '';
    el.periodCard.hidden = true;
    resetProcessing();
  });

  el.reviewList.addEventListener('change', function (event) {
    var checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    var id = Number(checkbox.getAttribute('data-work-id'));
    if (checkbox.checked) state.afterSelected.add(id);
    else state.afterSelected.delete(id);
    recompute();
  });

  el.selectAll.addEventListener('click', function () {
    state.after.forEach(function (work) { state.afterSelected.add(work.id); });
    renderReview();
    recompute();
  });

  el.selectNone.addEventListener('click', function () {
    state.afterSelected.clear();
    renderReview();
    recompute();
  });

  [el.start, el.end].forEach(function (input) {
    input.addEventListener('change', function () {
      el.periodStatus.className = 'status';
      el.periodStatus.innerHTML = '';
    });
  });
})();
