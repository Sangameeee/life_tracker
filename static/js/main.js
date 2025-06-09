let gameData = {
    dailyTasks: [],
    permanentRedTasks: [],
    permanentGreenTasks: [],
    dailyHistory: [], // Each entry now includes photo and notes
    goals: {
        weekly: '',
        monthly: '',
        yearly: ''
    },
    streak: 0,
    bestStreak: 0
};

function formatDateToLocalYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1) initialize the globals
    window.currentCalendarMonth = new Date().getMonth();
    window.currentCalendarYear  = new Date().getFullYear();

    // 2) populate the month header & calendar grid
    updateMonthDisplay();
    generateCalendar();

    // 3) (optional) also initialize the day selector
    const today = new Date();
    updateDateDisplay(today);
    updateCalendarHighlight(today);
    loadDayData(today);
    updateStats();
    updateProfileStats();
  });
// API utility functions
async function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// Load data from server on page load
window.onload = async function() {
    await loadGameData();
    
    // Initialize page-specific content based on current page
    const currentPage = getCurrentPage();
    
    switch(currentPage) {
        case 'home':
            renderTasks();
            updateStats();
            break;
        case 'profile':
            updateProfileStats();
            generateCalendar();
            break;
        case 'permanent':
            renderPermanentTasks();
            break;
        case 'goals':
            loadGoals();
            break;
    }
};

// Determine current page from URL or body class
function getCurrentPage() {
    const path = window.location.pathname;
    if (path === '/' || path === '/home' || path.includes('index')) return 'home';
    if (path.includes('profile')) return 'profile';
    if (path.includes('permanent')) return 'permanent';
    if (path.includes('goals')) return 'goals';
    if (path.includes('settings')) return 'settings';
    return 'home';
}

// Data management functions (replace localStorage with API calls)
async function saveGameData() {
    try {
        await apiRequest('/api/data', 'POST', gameData);
    } catch (error) {
        alert('Failed to save data. Please try again.');
    }
}

async function loadGameData() {
    try {
        const data = await apiRequest('/api/data');
        gameData = {...gameData, ...data};

        // Deduplicate dailyHistory
        const uniqueDates = new Set();
        gameData.dailyHistory = gameData.dailyHistory.filter(day => {
            if (uniqueDates.has(day.date)) return false;
            uniqueDates.add(day.date);
            return true;
        });

        // Initialize today's tasks if missing
        const today = formatDateToLocalYYYYMMDD(new Date());
        if (!gameData.dailyHistory.find(day => day.date === today)) {
            gameData.dailyTasks = [];
            gameData.dailyHistory.push({
                date: today,
                tasks: [],
                points: 0,
                notes: '',
                photo: ''
            });
        } else {
            const todayData = gameData.dailyHistory.find(day => day.date === today);
            gameData.dailyTasks = todayData.tasks || [];
        }
    } catch (error) {
        console.error('Failed to load data:', error);
    }
}

// Task management
function toggleTaskInput() {
    const input = document.getElementById('task-input');
    if (input) {
        input.style.display = input.style.display === 'flex' ? 'none' : 'flex';
        if (input.style.display === 'flex') {
            document.getElementById('new-task-name').focus();
        }
    }
}
async function addTask() {
    const nameEl = document.getElementById('new-task-name');
    const pointsEl = document.getElementById('new-task-points');
    if (!nameEl || !pointsEl) return;

    const name = nameEl.value;
    const points = parseInt(pointsEl.value) || 10;

    // Always use the selected date from calendar
    const dateDisplay = document.getElementById('current-date-display');
    const assignDate = dateDisplay?.dataset.date 
        ? formatDateToLocalYYYYMMDD(new Date(dateDisplay.dataset.date)) 
        : formatDateToLocalYYYYMMDD(new Date());

    if (name.trim()) {
        const task = {
            name: name.trim(),
            points: points,
            completed: false
        };

        try {
            const newTask = await apiRequest(`/api/tasks/${assignDate}`, 'POST', task);

            // Always update the displayed date's tasks
            const dayData = gameData.dailyHistory.find(day => day.date === assignDate);
            if (dayData) {
                dayData.tasks.push(newTask);
            } else {
                gameData.dailyHistory.push({
                    date: assignDate,
                    tasks: [newTask],
                    points: 0,
                    notes: '',
                    photo: ''
                });
            }

            // Update dailyTasks for the current displayed date
            gameData.dailyTasks.push(newTask);
            await saveDayData(new Date(assignDate));
            renderTasks(); // Immediately update UI

            // Clear inputs
            nameEl.value = '';
            pointsEl.value = '10';
            toggleTaskInput();
        } catch (error) {
            alert('Failed to add task');
        }
    }
    
}

function renderTasks() {
    const container = document.getElementById('tasks-container');
    if (!container) return;
    container.innerHTML = '';
    gameData.dailyTasks.forEach(task => {
        const taskEl = document.createElement('div');
        taskEl.className = 'task-item';
        taskEl.draggable = true;
        taskEl.dataset.taskId = task.id;
        taskEl.innerHTML = `
            <div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="toggleTask(${task.id})">
                ${task.completed ? '<i class="fas fa-check" style="color: white;"></i>' : ''}
            </div>
            <div class="task-content">
                <div class="task-name">${task.name}</div>
                <div class="task-points">${task.points > 0 ? '+' : ''}${task.points} points</div>
            </div>
            <div class="delete-task" onclick="deleteTask(${task.id})">
                <i class="fas fa-trash"></i>
            </div>
        `;
        container.appendChild(taskEl);
    });
    updateDailyPoints();
    makeDraggable();
}5
async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
        await apiRequest(`/api/tasks/${taskId}`, 'DELETE');
        gameData.dailyTasks = gameData.dailyTasks.filter(t => t.id !== taskId);
        renderTasks();
    } catch (error) {
        alert('Failed to delete task');
    }
}
async function toggleTask(taskId) {
    const task = gameData.dailyTasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        try {
            await apiRequest(`/api/tasks/${taskId}`, 'PUT', {completed: task.completed});
            renderTasks();
        } catch (error) {
            task.completed = !task.completed; // Revert on error
            alert('Failed to update task');
        }
    }
}



function updateDailyPoints() {
    const pointsEl = document.getElementById('daily-points');
    if (pointsEl) {
        const points = gameData.dailyTasks.reduce((total, task) => {
            return total + (task.completed ? task.points : 0);
        }, 0);
        pointsEl.textContent = points;
    }
}

// Permanent Tasks
function toggleRedTaskInput() {
    const input = document.getElementById('red-task-input');
    if (input) {
        input.style.display = input.style.display === 'flex' ? 'none' : 'flex';
        if (input.style.display === 'flex') {
            document.getElementById('new-red-task-name').focus();
        }
    }
}

function toggleGreenTaskInput() {
    const input = document.getElementById('green-task-input');
    if (input) {
        input.style.display = input.style.display === 'flex' ? 'none' : 'flex';
        if (input.style.display === 'flex') {
            document.getElementById('new-green-task-name').focus();
        }
    }
}

async function addRedTask() {
    const nameEl = document.getElementById('new-red-task-name');
    const pointsEl = document.getElementById('new-red-task-points');
    
    if (!nameEl || !pointsEl) return;
    
    const name = nameEl.value;
    const points = parseInt(pointsEl.value) || -10;
    
    if (name.trim()) {
        const task = {
            name: name.trim(),
            points: Math.abs(points) * -1, // Ensure negative
            type: 'red'
        };
        
        try {
            const newTask = await apiRequest('/api/permanent', 'POST', task);
            gameData.permanentRedTasks.push(newTask);
            renderPermanentTasks();
            
            nameEl.value = '';
            pointsEl.value = '-10';
            toggleRedTaskInput();
        } catch (error) {
            alert('Failed to add red task');
        }
    }
}

async function addGreenTask() {
    const nameEl = document.getElementById('new-green-task-name');
    const pointsEl = document.getElementById('new-green-task-points');
    
    if (!nameEl || !pointsEl) return;
    
    const name = nameEl.value;
    const points = parseInt(pointsEl.value) || 15;
    
    if (name.trim()) {
        const task = {
            name: name.trim(),
            points: Math.abs(points), // Ensure positive
            type: 'green'
        };
        
        try {
            const newTask = await apiRequest('/api/permanent', 'POST', task);
            gameData.permanentGreenTasks.push(newTask);
            renderPermanentTasks();
            
            nameEl.value = '';
            pointsEl.value = '15';
            toggleGreenTaskInput();
        } catch (error) {
            alert('Failed to add green task');
        }
    }
}

function renderPermanentTasks() {
    // Render red tasks
    const redContainer = document.getElementById('red-tasks-container');
    if (redContainer) {
        redContainer.innerHTML = '';
        
        gameData.permanentRedTasks.forEach(task => {
            const taskEl = document.createElement('div');
            taskEl.className = 'task-item';
            taskEl.style.background = 'linear-gradient(135deg, #ffe8e8, #ffcccc)';
            taskEl.style.borderColor = '#e74c3c';
            
            taskEl.innerHTML = `
                <div class="task-content">
                    <div class="task-name">${task.name}</div>
                    <div class="task-points" style="color: #e74c3c;">${task.points} points</div>
                </div>
                <div class="delete-task" onclick="deletePermanentTask('red', ${task.id})">
                    <i class="fas fa-trash"></i>
                </div>
            `;
            
            redContainer.appendChild(taskEl);
        });
    }

    // Render green tasks
    const greenContainer = document.getElementById('green-tasks-container');
    if (greenContainer) {
        greenContainer.innerHTML = '';
        
        gameData.permanentGreenTasks.forEach(task => {
            const taskEl = document.createElement('div');
            taskEl.className = 'task-item';
            taskEl.style.background = 'linear-gradient(135deg, #e8f5e8, #ccffcc)';
            taskEl.style.borderColor = '#27ae60';
            
            taskEl.innerHTML = `
                <div class="task-content">
                    <div class="task-name">${task.name}</div>
                    <div class="task-points" style="color: #27ae60;">+${task.points} points</div>
                </div>
                <div class="delete-task" onclick="deletePermanentTask('green', ${task.id})">
                    <i class="fas fa-trash"></i>
                </div>
            `;
            
            greenContainer.appendChild(taskEl);
        });
    }
}

async function deletePermanentTask(type, taskId) {
    try {
        await apiRequest(`/api/permanent/${type}/${taskId}`, 'DELETE');
        if (type === 'red') {
            gameData.permanentRedTasks = gameData.permanentRedTasks.filter(t => t.id !== taskId);
        } else {
            gameData.permanentGreenTasks = gameData.permanentGreenTasks.filter(t => t.id !== taskId);
        }
        renderPermanentTasks();
    } catch (error) {
        alert('Failed to delete permanent task');
    }
}

async function submitDay() {
    // Use the displayed date instead of today
    const displayDate = document.getElementById('current-date-display')?.dataset.date;
    const selectedDate = displayDate 
        ? new Date(displayDate) 
        : new Date();
    
    const today = formatDateToLocalYYYYMMDD(new Date());
    const selectedDateStr = formatDateToLocalYYYYMMDD(selectedDate);
    
    // Only allow submitting today's date for streak
    if (selectedDateStr !== today) {
        if (confirm('This will only save changes for this date. Continue?')) {
            return saveDayData(selectedDate);
        }
        return;
    }

    // Original submit logic for today
    const undoneTasks = gameData.dailyTasks.filter(task => !task.completed);
    const todayData = gameData.dailyHistory.find(day => day.date === today);
    const allTasksCompleted = gameData.dailyTasks.length > 0 && 
        gameData.dailyTasks.every(task => task.completed);

    if (todayData && allTasksCompleted) {
        alert('Day already completed! Streak is only counted once per day.');
        return;
    }

    if (undoneTasks.length > 0) {
        showUndoneTasksSection(undoneTasks);
        return;
    }

    await completeDay();
}
function showMessage(message, type = 'info') {
    const existing = document.querySelector('.status-message');
    if (existing) existing.remove();
    
    const msg = document.createElement('div');
    msg.className = `status-message ${type}`;
    msg.textContent = message;
    
    document.body.appendChild(msg);
    
    setTimeout(() => {
        msg.classList.add('fade-out');
        setTimeout(() => msg.remove(), 500);
    }, 3000);
}
function showUndoneTasksSection(undoneTasks) {
    const section = document.getElementById('undone-tasks-section');
    const list = document.getElementById('undone-tasks-list');
    
    if (!section || !list) return;
    
    list.innerHTML = '';
    undoneTasks.forEach(task => {
        const taskEl = document.createElement('div');
        taskEl.style.marginBottom = '1rem';
        taskEl.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 0.5rem;">${task.name} (${task.points} points)</div>
            <textarea class="excuse-input" placeholder="Why couldn't you complete this task?" data-task-id="${task.id}"></textarea>
        `;
        list.appendChild(taskEl);
    });
    
    section.style.display = 'block';
    
    // Update submit button
    const submitBtn = document.querySelector('.submit-day-btn');
    if (submitBtn) {
        submitBtn.onclick = completeDay;
        submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Complete Day';
    }
}

async function completeDay() {
    const notesEl = document.getElementById('daily-notes');
    const photoPreview = document.getElementById('photo-preview');
    const notes = notesEl ? notesEl.value : '';
    const photo = photoPreview ? photoPreview.src : '';
    
    // Use ISO date format consistently
    const today = formatDateToLocalYYYYMMDD(new Date());
    let todayData = gameData.dailyHistory.find(day => day.date === today);
    
    // Create today's data if it doesn't exist
    if (!todayData) {
        todayData = {
            date: today,
            tasks: [...gameData.dailyTasks],
            points: 0,
            notes: '',
            photo: ''
        };
        gameData.dailyHistory.push(todayData);
    }
    
    // Update today's data
    todayData.notes = notes;
    todayData.photo = photo;
    todayData.tasks = [...gameData.dailyTasks]; // Update tasks with current completion status
    
    // Collect excuses for undone tasks
    const excuses = {};
    document.querySelectorAll('.excuse-input').forEach(input => {
        const taskId = input.dataset.taskId;
        excuses[taskId] = input.value;
    });
    
    try {
        const result = await apiRequest('/api/submit-day', 'POST', {
            notes: notes,
            excuses: excuses
        });
        
        // Update points from API response
        todayData.points = result.points || 0;
        
        // Don't directly set streak - let updateStats calculate it properly
        // gameData.streak = result.streak; // Remove this line
        updateStats(); // This will recalculate streak correctly
        
        alert(`Day completed! You earned ${result.points} points. Current streak: ${gameData.streak} days.`);
        
        // Reset for next day
        gameData.dailyTasks = [];
        renderTasks();
        if (notesEl) notesEl.value = '';
        
        const undoneSection = document.getElementById('undone-tasks-section');
        if (undoneSection) undoneSection.style.display = 'none';
        
        // Always update calendar to show completion status
        generateCalendar();
        updateProfileStats();
        
        // Save to storage
        localStorage.setItem('gameData', JSON.stringify(gameData));
        
    } catch (error) {
        console.error('Failed to submit day:', error);
        alert('Failed to submit day');
    }
}

function displayDayPhoto(date = new Date()) {
    const dateStr = formatDateToLocalYYYYMMDD(date);
    const dayData = gameData.dailyHistory.find(d => d.date === dateStr);
    const preview = document.getElementById('photo-preview');
    
    if (preview) {
        if (dayData?.photo) {
            preview.src = dayData.photo;
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    }
}

function saveDayData(date) {
    const dateStr = formatDateToLocalYYYYMMDD(date);
    const displayDate = document.getElementById('current-date-display')?.dataset.date;
    const targetDate = dateStr === formatDateToLocalYYYYMMDD(new Date(displayDate)) 
        ? formatDateToLocalYYYYMMDD(new Date(displayDate)) 
        : dateStr;

    // Replace existing or add new
    const existingIndex = gameData.dailyHistory.findIndex(d => d.date === targetDate);
    if (existingIndex !== -1) {
        gameData.dailyHistory[existingIndex] = {
            date: targetDate,
            tasks: [...gameData.dailyTasks],
            points: gameData.dailyTasks.reduce((sum, task) => sum + (task.completed ? task.points : 0), 0),
            notes: document.getElementById('daily-notes')?.value || '',
            photo: document.getElementById('photo-preview')?.src || ''
        };
    } else {
        gameData.dailyHistory.push({
            date: targetDate,
            tasks: [...gameData.dailyTasks],
            points: 0,
            notes: '',
            photo: ''
        });
    }

    try {
        apiRequest(`/api/day/${targetDate}`, 'PUT', gameData.dailyHistory.find(d => d.date === targetDate));
        generateCalendar();
        showMessage(`Changes saved for ${targetDate}`, 'success');
        return true;
    } catch (error) {
        showMessage('Failed to save changes', 'error');
        return false;
    }
}
// Calendar
function generateCalendar() {
  const calendar = document.getElementById('calendar');
  if (!calendar) return;

  const month = window.currentCalendarMonth;
  const year  = window.currentCalendarYear;

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  // Day headers
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const hdr = document.createElement('div');
    hdr.className = 'calendar-day-header';
    hdr.textContent = d;
    grid.appendChild(hdr);
  });

  // Empty cells
  for (let i = 0; i < firstDay.getDay(); i++) {
    grid.appendChild(document.createElement('div'));
  }

  // Days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateObj = new Date(year, month, d);
    const iso = formatDateToLocalYYYYMMDD(dateObj);  // "YYYY-MM-DD"

    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    cell.textContent = d;
    cell.dataset.date = iso;

    // mark completion
    const dayData = gameData.dailyHistory.find(x => x.date === iso);
    if (dayData) {
      const rate = dayData.tasks.filter(t => t.completed).length / dayData.tasks.length;
      if (rate === 1) {
        cell.classList.add('completed');
      } else if (rate >= 0.5) {
        cell.style.background = 'linear-gradient(45deg,#f39c12,#e67e22)';
        cell.style.color = 'white';
      }
    }

    // highlight today
    if (iso === new Date().toISOString().split('T')[0]) {
      cell.classList.add('today');
    }

    cell.addEventListener('click', () => {
      const dt = new Date(cell.dataset.date);
      loadDayData(dt);
      updateDateDisplay(dt);
      updateCalendarHighlight(dt);
    });

    grid.appendChild(cell);
  }

  // swap in
  calendar.querySelector('.calendar-grid')?.remove();
  calendar.appendChild(grid);
}

function changeMonth(dir) {
  window.currentCalendarMonth += dir;
  if (window.currentCalendarMonth > 11) {
    window.currentCalendarMonth = 0;
    window.currentCalendarYear++;
  } else if (window.currentCalendarMonth < 0) {
    window.currentCalendarMonth = 11;
    window.currentCalendarYear--;
  }
  updateMonthDisplay();
  generateCalendar();
}

function updateMonthDisplay() {
  const names = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"];
  document.getElementById('current-month-display').textContent =
    `${names[window.currentCalendarMonth]} ${window.currentCalendarYear}`;
}

function updateCalendarHighlight(date) {
  const iso = formatDateToLocalYYYYMMDD(date);
  
  // First, remove 'selected' class from all calendar days
  document.querySelectorAll('.calendar-day').forEach(cell => {
    cell.classList.remove('selected');
  });
  
  // Then add 'selected' class only to the clicked date
  const targetCell = document.querySelector(`.calendar-day[data-date="${iso}"]`);
  if (targetCell) {
    targetCell.classList.add('selected');
  }
}


function updateDateDisplay(date) {
  const disp = document.getElementById('current-date-display');
  if (!disp) return;
  disp.textContent = date.toLocaleDateString();
  disp.dataset.date = date.toISOString();
}


function updateStreak() {
  // Sort daily history by date
  const sortedHistory = gameData.dailyHistory
    .filter(day => day.tasks && day.tasks.length > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (sortedHistory.length === 0) {
    gameData.streak = 0;
    gameData.bestStreak = Math.max(gameData.bestStreak || 0, 0);
    return;
  }
  
  let currentStreak = 0;
  let maxStreak = 0;
  let today = new Date().toISOString().split('T')[0];
  
  // Calculate streak from most recent completed days
  for (let i = sortedHistory.length - 1; i >= 0; i--) {
    const day = sortedHistory[i];
    const completedTasks = day.tasks.filter(t => t.completed).length;
    const totalTasks = day.tasks.length;
    
    if (completedTasks === totalTasks && totalTasks > 0) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      // If this is today and not completed, don't break the streak yet
      if (day.date === today) {
        continue;
      }
      break;
    }
  }
  
  gameData.streak = currentStreak;
  gameData.bestStreak = Math.max(gameData.bestStreak || 0, maxStreak);
}

// Updated stats function that uses the fixed streak calculation
function updateStats() {
  updateStreak(); // Recalculate streak properly
  
  const streakEl = document.getElementById('streak-count');
  if (streakEl) {
    streakEl.textContent = gameData.streak;
  }
}
async function loadDayData(date) {
    const dateStr = formatDateToLocalYYYYMMDD(date);
    let dayData = gameData.dailyHistory.find(d => d.date === dateStr);
    if (!dayData) {
        dayData = {
            date: dateStr,
            tasks: [],
            points: 0,
            notes: '',
            photo: ''
        };
        gameData.dailyHistory.push(dayData);
    }

    gameData.dailyTasks = [...dayData.tasks];
    renderTasks();
    // Update UI elements
    const pointsEl = document.getElementById('daily-points');
    if (pointsEl) pointsEl.textContent = dayData.points || 0;

    const notesEl = document.getElementById('daily-notes');
    if (notesEl) notesEl.value = dayData.notes || '';

    displayDayPhoto(date);
    updateStats();
}
function updateProfileStats() {
    const totalPoints = gameData.dailyHistory.reduce((sum, day) => sum + (day.points || 0), 0);
    const avgPoints = gameData.dailyHistory.length > 0 ? Math.round(totalPoints / gameData.dailyHistory.length) : 0;
    
    const totalPointsEl = document.getElementById('total-points');
    const avgPointsEl = document.getElementById('avg-points');
    const bestStreakEl = document.getElementById('best-streak');
    
    if (totalPointsEl) totalPointsEl.textContent = totalPoints;
    if (avgPointsEl) avgPointsEl.textContent = avgPoints;
    if (bestStreakEl) bestStreakEl.textContent = gameData.bestStreak;
    
    renderDailyHistory();
    renderProgressChart();
}
function changeDay(offset) {
    const currentDate = new Date(document.getElementById('current-date-display')?.dataset.date || new Date());
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + offset);
    
    loadDayData(newDate);
    updateDateDisplay(newDate);
    
    // Update calendar highlight
    updateCalendarHighlight(newDate);
}

function updateDateDisplay(date) {
    const display = document.getElementById('current-date-display');
    if (display) {
        display.textContent = date.toLocaleDateString();
        display.dataset.date = date.toISOString();
    }
}

function previewPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const dateDisplay = document.getElementById('current-date-display');
    const dateStr = dateDisplay?.dataset.date 
        ? formatDateToLocalYYYYMMDD(new Date(dateDisplay.dataset.date)) 
        : formatDateToLocalYYYYMMDD(new Date());

    const formData = new FormData();
    formData.append('photo', file);

    fetch(`/api/photo/${dateStr}`, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const preview = document.getElementById('photo-preview');
            preview.src = data.photo_url;
            preview.style.display = 'block';

            // Update gameData
            let dayData = gameData.dailyHistory.find(day => day.date === dateStr);
            if (!dayData) {
                dayData = { date: dateStr, tasks: [], points: 0, notes: '', photo: '' };
                gameData.dailyHistory.push(dayData);
            }
            dayData.photo = data.photo_url;
        } else {
            alert('Failed to upload photo');
        }
    })
    .catch(error => {
        console.error('Photo upload error:', error);
        alert('Error uploading photo');
    });
}
document.getElementById('delete-photo-btn')?.addEventListener('click', async () => {
    const dateDisplay = document.getElementById('current-date-display');
    const dateStr = dateDisplay?.dataset.date 
        ? formatDateToLocalYYYYMMDD(new Date(dateDisplay.dataset.date))
        : formatDateToLocalYYYYMMDD(new Date());

    try {
        await apiRequest(`/api/photo/${dateStr}`, 'DELETE');
        // Update UI
        const preview = document.getElementById('photo-preview');
        preview.src = '';
        preview.style.display = 'none';
        // Update gameData
        const dayData = gameData.dailyHistory.find(d => d.date === dateStr);
        if (dayData) dayData.photo = '';
        showMessage('Photo deleted successfully!', 'success');
    } catch (error) {
        showMessage('Failed to delete photo', 'error');
    }
});

function renderDailyHistory() {
    const container = document.getElementById('daily-history');
    if (!container) return;
    
    container.innerHTML = '';
    
    const sortedHistory = [...gameData.dailyHistory].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);
    
    sortedHistory.forEach(day => {
        const dayEl = document.createElement('div');
        dayEl.style.cssText = 'padding: 1rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;';
        
        const completedTasks = day.tasks ? day.tasks.filter(t => t.completed).length : 0;
        const totalTasks = day.tasks ? day.tasks.length : 0;
        
        dayEl.innerHTML = `
            <div>
                <div style="font-weight: bold;">${new Date(day.date).toLocaleDateString()}</div>
                <div style="color: #666; font-size: 0.9rem;">${completedTasks}/${totalTasks} tasks completed</div>
            </div>
            <div style="font-weight: bold; color: ${day.points >= 0 ? '#27ae60' : '#e74c3c'};">
                ${day.points > 0 ? '+' : ''}${day.points || 0} pts
            </div>
        `;
        
        container.appendChild(dayEl);
    });
}

function renderProgressChart() {
    const canvas = document.getElementById('progress-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const last30Days = [...gameData.dailyHistory].slice(-30);
    if (last30Days.length === 0) return;
    
    const maxPoints = Math.max(...last30Days.map(day => day.points || 0), 0);
    const minPoints = Math.min(...last30Days.map(day => day.points || 0), 0);
    const range = maxPoints - minPoints || 1;
    
    const width = canvas.width - 40;
    const height = canvas.height - 40;
    
    // Draw grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = 20 + (height / 5) * i;
        ctx.beginPath();
        ctx.moveTo(20, y);
        ctx.lineTo(width + 20, y);
        ctx.stroke();
    }
    
    // Draw line
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    last30Days.forEach((day, index) => {
        const x = 20 + (width / (last30Days.length - 1)) * index;
        const y = 20 + height - ((day.points - minPoints) / range) * height;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = '#667eea';
    last30Days.forEach((day, index) => {
        const x = 20 + (width / (last30Days.length - 1)) * index;
        const y = 20 + height - ((day.points - minPoints) / range) * height;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    });
}

// Goals
function loadGoals() {
    const weeklyEl = document.getElementById('weekly-goals');
    const monthlyEl = document.getElementById('monthly-goals');
    const yearlyEl = document.getElementById('yearly-goals');
    
    if (weeklyEl) weeklyEl.value = gameData.goals.weekly || '';
    if (monthlyEl) monthlyEl.value = gameData.goals.monthly || '';
    if (yearlyEl) yearlyEl.value = gameData.goals.yearly || '';
}

async function saveGoals() {
    const weeklyEl = document.getElementById('weekly-goals');
    const monthlyEl = document.getElementById('monthly-goals');
    const yearlyEl = document.getElementById('yearly-goals');
    
    const goals = {
        weekly: weeklyEl ? weeklyEl.value : '',
        monthly: monthlyEl ? monthlyEl.value : '',
        yearly: yearlyEl ? yearlyEl.value : ''
    };
    
    try {
        await apiRequest('/api/goals', 'PUT', goals);
        gameData.goals = goals;
        alert('Goals saved successfully!');
    } catch (error) {
        alert('Failed to save goals');
    }
}

// Settings
function exportData() {
    const dataStr = JSON.stringify(gameData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lifequest-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

async function importData() {
    const fileInput = document.getElementById('import-file');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a file to import');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            await apiRequest('/api/data', 'POST', importedData);
            location.reload(); // Refresh page to show imported data
        } catch (error) {
            alert('Error importing data. Please check the file format.');
        }
    };
    reader.readAsText(file);
}

async function resetAllData() {
    if (confirm('Are you sure you want to reset all data? This cannot be undone!')) {
        if (confirm('This will permanently delete all your progress. Type "RESET" to confirm.')) {
            const confirmation = prompt('Type "RESET" to confirm:');
            if (confirmation === 'RESET') {
                try {
                    await apiRequest('/api/reset', 'POST');
                    location.reload();
                } catch (error) {
                    alert('Failed to reset data');
                }
            }
        }
    }
}

// Drag and drop functionality
function makeDraggable() {
    const tasks = document.querySelectorAll('.task-item');
    
    tasks.forEach(task => {
        task.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', this.dataset.taskId);
            this.classList.add('dragging');
        });
        
        task.addEventListener('dragend', function() {
            this.classList.remove('dragging');
        });
    });
    
    const container = document.getElementById('tasks-container');
    if (!container) return;
    
    container.addEventListener('dragover', function(e) {
        e.preventDefault();
    });
    
    container.addEventListener('drop', function(e) {
        e.preventDefault();
        const draggedId = parseInt(e.dataTransfer.getData('text/plain'));
        const dropTarget = e.target.closest('.task-item');
        
        if (dropTarget && dropTarget.dataset.taskId) {
            const dropId = parseInt(dropTarget.dataset.taskId);
            reorderTasks(draggedId, dropId);
        }
    });
}

async function reorderTasks(draggedId, dropId) {
    const draggedIndex = gameData.dailyTasks.findIndex(t => t.id === draggedId);
    const dropIndex = gameData.dailyTasks.findIndex(t => t.id === dropId);
    
    if (draggedIndex !== -1 && dropIndex !== -1) {
        const draggedTask = gameData.dailyTasks.splice(draggedIndex, 1)[0];
        gameData.dailyTasks.splice(dropIndex, 0, draggedTask);
        
        try {
            await saveGameData();
            renderTasks();
        } catch (error) {
            // Revert on error
            gameData.dailyTasks.splice(dropIndex, 1);
            gameData.dailyTasks.splice(draggedIndex, 0, draggedTask);
            alert('Failed to reorder tasks');
        }
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
        const activeInput = document.querySelector('.task-input[style*="flex"]');
        if (activeInput) {
            if (activeInput.id === 'task-input') addTask();
            else if (activeInput.id === 'red-task-input') addRedTask();
            else if (activeInput.id === 'green-task-input') addGreenTask();
        }
    }
});
document.getElementById('save-changes-btn')?.addEventListener('click', async () => {
    const dateDisplay = document.getElementById('current-date-display');
    const dateStr = dateDisplay?.dataset.date 
        ? formatDateToLocalYYYYMMDD(new Date(dateDisplay.dataset.date)) 
        : formatDateToLocalYYYYMMDD(new Date());

    const dayData = {
        tasks: [...gameData.dailyTasks],
        points: gameData.dailyTasks.reduce((sum, t) => sum + (t.completed ? t.points : 0), 0),
        notes: document.getElementById('daily-notes')?.value || '',
        photo: document.getElementById('photo-preview')?.src || ''
    };

    try {
        await apiRequest(`/api/day/${dateStr}`, 'PUT', dayData);
        generateCalendar();
        showMessage('Changes saved successfully!', 'success');
    } catch (error) {
        showMessage('Failed to save changes', 'error');
    }
});