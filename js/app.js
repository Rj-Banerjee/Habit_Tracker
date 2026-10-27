// app.js - Master application coordinator & reactive renderer

import { MONTH_NAMES, getTodayInfo, getMonthCalendar } from './dateUtils.js';
import { HabitStore } from './store.js';
import {
  calculateDailyHabitStats,
  calculateTopHabits,
  calculateMonthDailyProgress,
  calculateWeeklyHabitsStats,
  calculateMonthlyHabitsStats
} from './streakCalc.js';
import {
  createDonutSVG,
  renderWaveAreaChart,
  renderWeeklyBarsBlock,
  renderWeeklyHabitsProgressChart
} from './charts.js';
import { getDailyQuote, QUOTES_DATABASE } from './quotes.js';
import { generateMonthlyReview } from './reviewGenerator.js';

class HabitTrackerApp {
  constructor() {
    this.store = new HabitStore();
    this.today = getTodayInfo();
    this.currentQuoteIndex = null;
    
    // Cache DOM elements
    this.dom = {
      todayDatePill: document.getElementById('todayDatePill'),
      btnJumpToday: document.getElementById('btnJumpToday'),
      btnQuickCheckToday: document.getElementById('btnQuickCheckToday'),
      btnExportData: document.getElementById('btnExportData'),
      btnResetDemo: document.getElementById('btnResetDemo'),
      
      monthTitle: document.getElementById('monthTitle'),
      monthSelect: document.getElementById('monthSelect'),
      yearSelect: document.getElementById('yearSelect'),
      waveChartContainer: document.getElementById('waveChartContainer'),
      dailyProgressVal: document.getElementById('dailyProgressVal'),
      headerDonutContainer: document.getElementById('headerDonutContainer'),
      
      quoteImage: document.getElementById('quoteImage'),
      quotePrefix: document.getElementById('quotePrefix'),
      quoteText: document.getElementById('quoteText'),
      quoteAuthor: document.getElementById('quoteAuthor'),
      btnShuffleQuote: document.getElementById('btnShuffleQuote'),
      
      weeklyBarsContainer: document.getElementById('weeklyBarsContainer'),
      top10TableBody: document.getElementById('top10TableBody'),
      top10MilestoneMessage: document.getElementById('top10MilestoneMessage'),
      
      dailyTableHead: document.getElementById('dailyTableHead'),
      dailyTableBody: document.getElementById('dailyTableBody'),
      btnAddDailyHabit: document.getElementById('btnAddDailyHabit'),
      
      weeklyDonutContainer: document.getElementById('weeklyDonutContainer'),
      weeklyStatsList: document.getElementById('weeklyStatsList'),
      weeklyChecklistGrid: document.getElementById('weeklyChecklistGrid'),
      weeklyProgressChartContainer: document.getElementById('weeklyProgressChartContainer'),
      
      monthlyDonutContainer: document.getElementById('monthlyDonutContainer'),
      monthlyItemsList: document.getElementById('monthlyItemsList'),
      monthlyBarFill: document.getElementById('monthlyBarFill'),
      monthlyPctText: document.getElementById('monthlyPctText'),
      btnAddMonthlyHabit: document.getElementById('btnAddMonthlyHabit'),
      
      reflectionTextarea: document.getElementById('reflectionTextarea'),
      btnAutoGenerateReview: document.getElementById('btnAutoGenerateReview'),
      
      // Modals
      genericModal: document.getElementById('genericModal'),
      modalTitle: document.getElementById('modalTitle'),
      modalBody: document.getElementById('modalBody'),
      modalCloseBtn: document.getElementById('modalCloseBtn'),
      modalCancelBtn: document.getElementById('modalCancelBtn'),
      modalSubmitBtn: document.getElementById('modalSubmitBtn'),
      
      toastContainer: document.getElementById('toastContainer')
    };

    this.init();
  }

  init() {
    this.populateDateSelectors();
    this.bindEvents();
    this.renderQuote();
    
    // Subscribe store changes to re-render
    this.store.subscribe(() => this.render());
    
    // Initial render
    this.render();

    // Check if current date is highlighted
    this.updateTodayPill();
  }

  updateTodayPill() {
    if (this.dom.todayDatePill) {
      this.dom.todayDatePill.innerHTML = `
        <span class="today-dot"></span>
        <span>Today: ${this.today.formatted}</span>
      `;
    }
  }

  populateDateSelectors() {
    // Populate month options
    this.dom.monthSelect.innerHTML = MONTH_NAMES.map((m, i) => `
      <option value="${i}">${m}</option>
    `).join('');

    // Populate year options (2024 to 2030)
    const currentYear = this.today.year;
    const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
    this.dom.yearSelect.innerHTML = years.map(y => `
      <option value="${y}">${y}</option>
    `).join('');

    const state = this.store.getState();
    this.dom.monthSelect.value = state.selectedMonth;
    this.dom.yearSelect.value = state.selectedYear;
  }

  bindEvents() {
    // Month/Year select change
    this.dom.monthSelect.addEventListener('change', (e) => {
      this.store.setDate(Number(this.dom.yearSelect.value), Number(e.target.value));
    });

    this.dom.yearSelect.addEventListener('change', (e) => {
      this.store.setDate(Number(e.target.value), Number(this.dom.monthSelect.value));
    });

    // Jump to Today button
    this.dom.btnJumpToday.addEventListener('click', () => {
      this.dom.monthSelect.value = this.today.month;
      this.dom.yearSelect.value = this.today.year;
      this.store.setDate(this.today.year, this.today.month);
      this.showToast(`Switched to ${MONTH_NAMES[this.today.month]} ${this.today.year} (Today)`);
      setTimeout(() => {
        const todayCol = document.querySelector('.is-today-col');
        if (todayCol) {
          todayCol.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 100);
    });

    // Quick Check for Today Modal
    this.dom.btnQuickCheckToday.addEventListener('click', () => {
      this.openQuickCheckModal();
    });

    // Reset Demo button
    this.dom.btnResetDemo.addEventListener('click', () => {
      if (confirm('Reset to the June 2026 demo data from the screenshots?')) {
        this.store.resetToDemo();
        this.dom.monthSelect.value = 5; // June
        this.dom.yearSelect.value = 2026;
        this.showToast('Reset to screenshot demo data!');
      }
    });

    // Export / Import Data button
    this.dom.btnExportData.addEventListener('click', () => {
      this.openExportImportModal();
    });

    // Motivational quote shuffle
    this.dom.btnShuffleQuote.addEventListener('click', () => {
      this.shuffleQuote();
    });

    // Add Daily Habit button
    this.dom.btnAddDailyHabit.addEventListener('click', () => {
      this.openAddDailyHabitModal();
    });

    // Add Monthly Habit button
    this.dom.btnAddMonthlyHabit.addEventListener('click', () => {
      this.openAddMonthlyHabitModal();
    });

    // Reflection textarea auto-save
    let saveTimeout;
    this.dom.reflectionTextarea.addEventListener('input', (e) => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        this.store.setReflection(e.target.value);
      }, 500);
    });

    // Auto-generate review button
    this.dom.btnAutoGenerateReview.addEventListener('click', () => {
      this.handleAutoGenerateReview();
    });

    // Modal Close handlers
    this.dom.modalCloseBtn.addEventListener('click', () => this.closeModal());
    this.dom.modalCancelBtn.addEventListener('click', () => this.closeModal());
    this.dom.genericModal.addEventListener('click', (e) => {
      if (e.target === this.dom.genericModal) this.closeModal();
    });

    // Handle window resize for wave chart
    window.addEventListener('resize', () => {
      const state = this.store.getState();
      const calendar = getMonthCalendar(state.selectedYear, state.selectedMonth);
      const dailyProgress = calculateMonthDailyProgress(state.dailyHabits, calendar, state.completions);
      renderWaveAreaChart(this.dom.waveChartContainer, dailyProgress.daysStats);
    });
  }

  renderQuote() {
    let quoteObj;
    if (this.currentQuoteIndex !== null) {
      quoteObj = QUOTES_DATABASE[this.currentQuoteIndex];
    } else {
      quoteObj = getDailyQuote();
    }

    this.dom.quotePrefix.textContent = quoteObj.prefix || 'I am ...';
    this.dom.quoteText.textContent = `"${quoteObj.quote}"`;
    this.dom.quoteAuthor.textContent = quoteObj.author;
    this.dom.quoteImage.src = quoteObj.image;
    this.dom.quoteImage.alt = quoteObj.theme;
  }

  shuffleQuote() {
    this.currentQuoteIndex = Math.floor(Math.random() * QUOTES_DATABASE.length);
    this.renderQuote();
    this.showToast('Fresh daily inspiration loaded ✨');
  }

  render() {
    const state = this.store.getState();
    const calendar = getMonthCalendar(state.selectedYear, state.selectedMonth);

    // Update Header
    this.dom.monthTitle.textContent = calendar.monthName;
    this.dom.monthSelect.value = state.selectedMonth;
    this.dom.yearSelect.value = state.selectedYear;

    // Calculate core statistics
    const dailyProgress = calculateMonthDailyProgress(state.dailyHabits, calendar, state.completions);
    const topHabits = calculateTopHabits(state.dailyHabits, calendar, state.completions);
    const weeklyStats = calculateWeeklyHabitsStats(state.weeklyHabits);
    const monthlyStats = calculateMonthlyHabitsStats(state.monthlyHabits);

    // 1. Top Wave Chart
    renderWaveAreaChart(this.dom.waveChartContainer, dailyProgress.daysStats);

    // 2. Top Header Progress Card (e.g. 81.33% and 466 / 573)
    this.dom.dailyProgressVal.textContent = dailyProgress.overallPercentageFormatted;
    this.dom.headerDonutContainer.innerHTML = createDonutSVG({
      percentage: dailyProgress.overallPercentage,
      size: 90,
      strokeWidth: 9,
      color: '#f472b6',
      trackColor: '#fce7f3',
      centerMain: `${dailyProgress.totalCompletions} / ${dailyProgress.totalPossible}`,
      centerSub: 'HABITS',
      subAbove: true
    });

    // 3. Weekly Bars Center Block
    renderWeeklyBarsBlock(this.dom.weeklyBarsContainer, dailyProgress.weekStats);

    // 4. Top 10 Habits Leaderboard
    this.renderTop10Habits(topHabits);

    // 5. Daily Habits Matrix Table
    this.renderDailyHabitsTable(state.dailyHabits, calendar, state.completions);

    // 6. Weekly Habits Section
    this.renderWeeklySection(weeklyStats, state.weeklyHabits);

    // 7. Monthly Habits Section
    this.renderMonthlySection(monthlyStats, state.monthlyHabits);

    // 8. Reflection Text
    if (document.activeElement !== this.dom.reflectionTextarea) {
      this.dom.reflectionTextarea.value = state.reflection || '';
    }
  }

  renderTop10Habits(topHabits) {
    if (topHabits.top10.length === 0) {
      this.dom.top10TableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color: #94a3b8;">No daily habits yet. Add one to begin!</td></tr>`;
      this.dom.top10MilestoneMessage.textContent = 'Add habits to see your ranking!';
      return;
    }

    this.dom.top10TableBody.innerHTML = topHabits.top10.map((h, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${h.name}</td>
        <td style="color: ${h.percentage >= 100 ? '#16a34a' : '#1e293b'}">${h.percentageFormatted}</td>
      </tr>
    `).join('');

    this.dom.top10MilestoneMessage.textContent = topHabits.message;
  }

  renderDailyHabitsTable(dailyHabits, calendar, completions) {
    // Generate Table Header with 5 week groups and day columns
    let headHtml = `
      <tr>
        <th rowspan="2" class="col-habit-num">#</th>
        <th rowspan="2" class="col-habit-name">daily habit</th>
    `;

    // Top week group row
    [1, 2, 3, 4, 5].forEach(wIndex => {
      const daysInWeek = calendar.weeks[wIndex] || [];
      if (daysInWeek.length > 0) {
        headHtml += `<th colspan="${daysInWeek.length}" class="th-week-group-${wIndex}">week ${wIndex}</th>`;
      }
    });

    headHtml += `
        <th rowspan="2" class="col-stat">goal</th>
        <th rowspan="2" class="col-progress-bar">percentage</th>
        <th rowspan="2" class="col-stat">count</th>
        <th rowspan="2" class="col-stat" title="Longest consecutive completed days in month">longest streak</th>
      </tr>
      <tr>
    `;

    // Bottom day columns row (Letter and Day number)
    calendar.days.forEach(d => {
      const isToday = (calendar.year === this.today.year &&
                       calendar.month === this.today.month &&
                       d.day === this.today.day);
      headHtml += `
        <th class="col-day-cell ${isToday ? 'is-today-col' : ''}" title="${calendar.monthName} ${d.day}">
          <div class="th-day-letter">${d.letter}</div>
          <div class="th-day-num ${isToday ? 'today-header-badge' : ''}">${d.day}</div>
        </th>
      `;
    });

    headHtml += `</tr>`;
    this.dom.dailyTableHead.innerHTML = headHtml;

    // Generate Body Rows
    if (dailyHabits.length === 0) {
      this.dom.dailyTableBody.innerHTML = `
        <tr>
          <td colspan="${6 + calendar.days.length}" style="text-align: center; padding: 40px; color: #94a3b8;">
            No daily habits tracked yet. Click "+ Add Habit" above to start!
          </td>
        </tr>
      `;
      return;
    }

    let bodyHtml = '';
    dailyHabits.forEach((habit, index) => {
      const stats = calculateDailyHabitStats(habit, calendar, completions);
      const habitCompletions = completions[habit.id] || {};

      bodyHtml += `
        <tr data-habit-id="${habit.id}">
          <td class="col-habit-num">${index + 1}</td>
          <td class="col-habit-name">
            <div class="habit-name-wrap">
              <span class="habit-name-text" title="${habit.name}">${habit.name}</span>
              <div class="habit-row-actions">
                <button class="btn-icon-subtle btn-edit-daily" data-id="${habit.id}" title="Edit habit">✎</button>
                <button class="btn-icon-subtle btn-delete-daily" data-id="${habit.id}" title="Delete habit">✕</button>
              </div>
            </div>
          </td>
      `;

      // Days checkboxes
      calendar.days.forEach(d => {
        const isChecked = !!habitCompletions[d.dateKey];
        const isToday = (calendar.year === this.today.year &&
                         calendar.month === this.today.month &&
                         d.day === this.today.day);

        bodyHtml += `
          <td class="col-day-cell ${isToday ? 'is-today-col' : ''}">
            <div
              class="habit-checkbox cb-week-${d.weekIndex} ${isChecked ? 'checked' : ''}"
              data-habit-id="${habit.id}"
              data-date-key="${d.dateKey}"
              title="${habit.name} - ${calendar.monthName} ${d.day} (${isChecked ? 'Done' : 'Incomplete'})"
            >
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            </div>
          </td>
        `;
      });

      // Stats
      const barFillWidth = Math.min(stats.percentage, 100);
      bodyHtml += `
          <td class="col-stat">${stats.goal}</td>
          <td class="col-progress-bar">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11px; font-weight: 600; width: 32px;">${Math.round(stats.percentage)}%</span>
              <div class="progress-bar-slot">
                <div class="progress-bar-fill" style="width: ${barFillWidth}%;"></div>
              </div>
            </div>
          </td>
          <td class="col-stat stat-val-bold">${stats.count} / ${stats.goal}</td>
          <td class="col-stat stat-val-bold">${stats.longestStreak}</td>
        </tr>
      `;
    });

    this.dom.dailyTableBody.innerHTML = bodyHtml;

    // Attach event listeners to checkboxes
    const checkboxes = this.dom.dailyTableBody.querySelectorAll('.habit-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('click', (e) => {
        const habitId = cb.getAttribute('data-habit-id');
        const dateKey = cb.getAttribute('data-date-key');
        this.store.toggleDailyCompletion(habitId, dateKey);
      });
    });

    // Attach edit and delete handlers
    this.dom.dailyTableBody.querySelectorAll('.btn-delete-daily').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const habitId = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this habit?')) {
          this.store.deleteDailyHabit(habitId);
          this.showToast('Habit deleted');
        }
      });
    });

    this.dom.dailyTableBody.querySelectorAll('.btn-edit-daily').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const habitId = btn.getAttribute('data-id');
        const habit = dailyHabits.find(h => h.id === habitId);
        if (habit) {
          this.openEditDailyHabitModal(habit);
        }
      });
    });
  }

  renderWeeklySection(weeklyStats, weeklyHabits) {
    // 1. Donut Chart
    this.dom.weeklyDonutContainer.innerHTML = createDonutSVG({
      percentage: weeklyStats.percentage,
      size: 130,
      strokeWidth: 12,
      color: '#93c5fd',
      trackColor: '#dbeafe',
      centerMain: weeklyStats.percentageFormatted,
      centerSub: 'weekly progress'
    });

    // 2. Stats summary list
    this.dom.weeklyStatsList.innerHTML = `
      <div class="weekly-stat-row"><span>% completed</span><strong>${weeklyStats.percentageFormatted}</strong></div>
      <div class="weekly-stat-row"><span>completed</span><strong>${weeklyStats.completed}</strong></div>
      <div class="weekly-stat-row"><span>incomplete</span><strong>${weeklyStats.incomplete}</strong></div>
      <div class="weekly-stat-row"><span>total habits</span><strong>${weeklyStats.total}</strong></div>
    `;

    // 3. 5-Week Checklists
    let gridHtml = '';
    [1, 2, 3, 4, 5].forEach(w => {
      const items = weeklyHabits[w] || [];
      gridHtml += `
        <div class="week-column-card">
          <div class="week-column-header wch-${w}">week ${w}</div>
          <div class="week-column-items">
            ${items.map(item => `
              <div class="checklist-item-row" data-week="${w}" data-id="${item.id}">
                <div class="habit-checkbox cb-week-${w} ${item.completed ? 'checked' : ''}" data-week="${w}" data-id="${item.id}">
                  <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                </div>
                <span class="checklist-text ${item.completed ? 'checked' : ''}" data-week="${w}" data-id="${item.id}">${item.text}</span>
                <button class="btn-icon-subtle btn-delete-weekly" data-week="${w}" data-id="${item.id}" title="Delete">✕</button>
              </div>
            `).join('')}
            <button class="btn-add-item-subtle btn-add-weekly-item" data-week="${w}">+ Add Habit</button>
          </div>
        </div>
      `;
    });
    this.dom.weeklyChecklistGrid.innerHTML = gridHtml;

    // Attach weekly checklist toggles
    this.dom.weeklyChecklistGrid.querySelectorAll('.habit-checkbox, .checklist-text').forEach(el => {
      el.addEventListener('click', () => {
        const week = Number(el.getAttribute('data-week'));
        const id = el.getAttribute('data-id');
        this.store.toggleWeeklyHabit(week, id);
      });
    });

    // Attach weekly delete buttons
    this.dom.weeklyChecklistGrid.querySelectorAll('.btn-delete-weekly').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const week = Number(btn.getAttribute('data-week'));
        const id = btn.getAttribute('data-id');
        this.store.deleteWeeklyHabit(week, id);
      });
    });

    // Attach add weekly habit buttons
    this.dom.weeklyChecklistGrid.querySelectorAll('.btn-add-weekly-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const week = Number(btn.getAttribute('data-week'));
        this.openAddWeeklyHabitModal(week);
      });
    });

    // 4. Weekly Progress Vertical Bar Chart
    renderWeeklyHabitsProgressChart(this.dom.weeklyProgressChartContainer, weeklyStats);
  }

  renderMonthlySection(monthlyStats, monthlyHabits) {
    // 1. Donut Ring
    this.dom.monthlyDonutContainer.innerHTML = createDonutSVG({
      percentage: monthlyStats.percentage,
      size: 130,
      strokeWidth: 12,
      color: '#f472b6',
      trackColor: '#fce7f3',
      centerMain: monthlyStats.percentageFormatted,
      centerSub: `${monthlyStats.completed} / ${monthlyStats.total} completed`
    });

    // 2. Progress Bar
    this.dom.monthlyBarFill.style.width = `${monthlyStats.percentage}%`;
    this.dom.monthlyPctText.textContent = monthlyStats.percentageFormatted;

    // 3. Checklist Items
    this.dom.monthlyItemsList.innerHTML = monthlyHabits.map(item => `
      <div class="checklist-item-row" data-id="${item.id}">
        <div class="habit-checkbox cb-week-2 ${item.completed ? 'checked' : ''}" data-id="${item.id}">
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
        <span class="checklist-text ${item.completed ? 'checked' : ''}" data-id="${item.id}">${item.text}</span>
        <button class="btn-icon-subtle btn-delete-monthly" data-id="${item.id}" title="Delete">✕</button>
      </div>
    `).join('');

    // Toggle listener
    this.dom.monthlyItemsList.querySelectorAll('.habit-checkbox, .checklist-text').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        this.store.toggleMonthlyHabit(id);
      });
    });

    // Delete listener
    this.dom.monthlyItemsList.querySelectorAll('.btn-delete-monthly').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        this.store.deleteMonthlyHabit(id);
      });
    });
  }

  handleAutoGenerateReview() {
    const state = this.store.getState();
    const calendar = getMonthCalendar(state.selectedYear, state.selectedMonth);
    const dailyStats = calculateMonthDailyProgress(state.dailyHabits, calendar, state.completions);
    const topHabits = calculateTopHabits(state.dailyHabits, calendar, state.completions);
    const weeklyStats = calculateWeeklyHabitsStats(state.weeklyHabits);
    const monthlyStats = calculateMonthlyHabitsStats(state.monthlyHabits);

    const reviewText = generateMonthlyReview({
      monthName: calendar.monthName,
      year: calendar.year,
      dailyStats,
      topHabits,
      weeklyStats,
      monthlyStats
    });

    this.dom.reflectionTextarea.value = reviewText;
    this.store.setReflection(reviewText);
    this.showToast('Monthly progress review generated! ✨');
  }

  // --- Modal Helpers ---
  openModal(title, bodyHtml, onSubmit) {
    this.dom.modalTitle.textContent = title;
    this.dom.modalBody.innerHTML = bodyHtml;
    this.dom.genericModal.classList.add('active');

    // Remove existing submit handlers
    const newSubmitBtn = this.dom.modalSubmitBtn.cloneNode(true);
    this.dom.modalSubmitBtn.parentNode.replaceChild(newSubmitBtn, this.dom.modalSubmitBtn);
    this.dom.modalSubmitBtn = newSubmitBtn;

    if (onSubmit) {
      this.dom.modalSubmitBtn.style.display = 'block';
      this.dom.modalSubmitBtn.addEventListener('click', () => {
        if (onSubmit()) {
          this.closeModal();
        }
      });
    } else {
      this.dom.modalSubmitBtn.style.display = 'none';
    }
  }

  closeModal() {
    this.dom.genericModal.classList.remove('active');
  }

  openAddDailyHabitModal() {
    const body = `
      <div class="form-group">
        <label class="form-label" for="dailyHabitName">Habit Name</label>
        <input type="text" id="dailyHabitName" class="form-input" placeholder="e.g. Read 15 pages of a book" autofocus />
      </div>
      <div class="form-group">
        <label class="form-label" for="dailyHabitGoal">Monthly Target Goal (Days)</label>
        <input type="number" id="dailyHabitGoal" class="form-input" value="30" min="1" max="31" />
        <span class="form-help">Number of days you aim to complete this habit in the month.</span>
      </div>
    `;

    this.openModal('Add Daily Habit', body, () => {
      const name = document.getElementById('dailyHabitName').value.trim();
      const goal = Number(document.getElementById('dailyHabitGoal').value) || 30;
      if (!name) {
        alert('Please enter a habit name.');
        return false;
      }
      this.store.addDailyHabit(name, goal);
      this.showToast(`Habit "${name}" added!`);
      return true;
    });
  }

  openEditDailyHabitModal(habit) {
    const body = `
      <div class="form-group">
        <label class="form-label" for="editHabitName">Habit Name</label>
        <input type="text" id="editHabitName" class="form-input" value="${habit.name}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="editHabitGoal">Monthly Target Goal (Days)</label>
        <input type="number" id="editHabitGoal" class="form-input" value="${habit.goal}" min="1" max="31" />
      </div>
    `;

    this.openModal('Edit Daily Habit', body, () => {
      const name = document.getElementById('editHabitName').value.trim();
      const goal = Number(document.getElementById('editHabitGoal').value) || habit.goal;
      if (!name) return false;
      this.store.updateDailyHabit(habit.id, name, goal);
      this.showToast('Habit updated!');
      return true;
    });
  }

  openAddWeeklyHabitModal(weekNum) {
    const body = `
      <div class="form-group">
        <label class="form-label" for="weeklyHabitText">Weekly Habit / Task</label>
        <input type="text" id="weeklyHabitText" class="form-input" placeholder="e.g. Organize digital files" autofocus />
      </div>
    `;

    this.openModal(`Add Habit for Week ${weekNum}`, body, () => {
      const text = document.getElementById('weeklyHabitText').value.trim();
      if (!text) return false;
      this.store.addWeeklyHabit(weekNum, text);
      this.showToast(`Added to Week ${weekNum}!`);
      return true;
    });
  }

  openAddMonthlyHabitModal() {
    const body = `
      <div class="form-group">
        <label class="form-label" for="monthlyHabitText">Monthly Milestone Habit</label>
        <input type="text" id="monthlyHabitText" class="form-input" placeholder="e.g. Review financial investments" autofocus />
      </div>
    `;

    this.openModal('Add Monthly Habit', body, () => {
      const text = document.getElementById('monthlyHabitText').value.trim();
      if (!text) return false;
      this.store.addMonthlyHabit(text);
      this.showToast('Monthly habit added!');
      return true;
    });
  }

  openQuickCheckModal() {
    const state = this.store.getState();
    const todayKey = this.today.dateKey;
    const habits = state.dailyHabits;

    let bodyHtml = `
      <p style="font-size: 13px; color: #64748b; margin-bottom: 8px;">
        Quickly log completions for today: <strong>${this.today.formatted}</strong>
      </p>
      <div class="today-quick-list">
    `;

    habits.forEach(h => {
      const isDone = !!(state.completions[h.id] && state.completions[h.id][todayKey]);
      bodyHtml += `
        <div class="today-quick-row ${isDone ? 'done' : ''}" data-id="${h.id}">
          <span class="today-quick-name">${h.name}</span>
          <div class="habit-checkbox cb-week-1 ${isDone ? 'checked' : ''}">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
        </div>
      `;
    });

    bodyHtml += `</div>`;

    this.openModal("Today's Habit Checklist", bodyHtml, null);

    const rows = this.dom.modalBody.querySelectorAll('.today-quick-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-id');
        this.store.toggleDailyCompletion(id, todayKey);
        
        // Re-read completion state
        const newState = this.store.getState();
        const doneNow = !!(newState.completions[id] && newState.completions[id][todayKey]);
        row.classList.toggle('done', doneNow);
        const cb = row.querySelector('.habit-checkbox');
        cb.classList.toggle('checked', doneNow);
      });
    });
  }

  openExportImportModal() {
    const jsonStr = this.store.exportJSON();
    const body = `
      <div class="form-group">
        <label class="form-label">Export Data Backup (JSON)</label>
        <textarea id="exportTextarea" class="form-textarea" rows="5" readonly>${jsonStr}</textarea>
        <button id="btnCopyJson" class="btn-secondary" style="margin-top: 6px; font-size: 11px;">📋 Copy JSON</button>
      </div>
      <div class="form-group" style="margin-top: 10px;">
        <label class="form-label">Import Data Backup</label>
        <textarea id="importTextarea" class="form-textarea" rows="4" placeholder="Paste your backup JSON here..."></textarea>
      </div>
    `;

    this.openModal('Backup & Restore', body, () => {
      const importText = document.getElementById('importTextarea').value.trim();
      if (importText) {
        const ok = this.store.importJSON(importText);
        if (ok) {
          this.showToast('Data imported successfully!');
          return true;
        } else {
          alert('Invalid JSON format. Please verify your backup.');
          return false;
        }
      }
      return true;
    });

    document.getElementById('btnCopyJson').addEventListener('click', () => {
      const textarea = document.getElementById('exportTextarea');
      textarea.select();
      navigator.clipboard.writeText(textarea.value);
      this.showToast('Copied JSON to clipboard!');
    });
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }
}

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new HabitTrackerApp();
});
