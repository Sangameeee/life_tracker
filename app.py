from flask import Flask, render_template, request, jsonify
import os, json
import glob
from werkzeug.utils import secure_filename
from datetime import datetime

app = Flask(__name__)
DATA_DIR = 'data'
DATA_FILE = os.path.join(DATA_DIR, 'gamedata.json')
PHOTOS_DIR = os.path.join('static', 'photos')
os.makedirs(PHOTOS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Load or initialize game data
if os.path.exists(DATA_FILE):
    with open(DATA_FILE) as f:
        game_data = json.load(f)
else:
    game_data = {
        'dailyTasks': [],
        'permanentRedTasks': [],
        'permanentGreenTasks': [],
        'dailyHistory': [],
        'goals': {'weekly': '', 'monthly': '', 'yearly': ''},
        'streak': 0,
        'bestStreak': 0
    }

def upload_photo(date):
    # 1. Check if a photo was uploaded
    if 'photo' not in request.files:
        return jsonify({'success': False, 'error': 'No photo uploaded'}), 400
    file = request.files['photo']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400

    # 2. Validate date format (YYYY-MM-DD)
    try:
        datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

    # 3. Delete any existing photo(s) for this date
    existing_files = glob.glob(os.path.join(PHOTOS_DIR, f'{date}.*'))
    for f in existing_files:
        os.remove(f)

    # 4. Save the new photo with the date as the filename
    ext = os.path.splitext(file.filename)[1] or '.jpg'
    filename = f'{date}{ext}'
    file.save(os.path.join(PHOTOS_DIR, filename))

    # 5. Return success response with photo URL
    return jsonify({
        'success': True,
        'photo_url': f'/static/photos/{filename}'
    })
# Utility to save
def save_data():
    with open(DATA_FILE, 'w') as f:
        json.dump(game_data, f, indent=2)

# Routes to pages with nav context
def common_nav_context(**kwargs):
    # always include current streak
    return {**kwargs, 'streak': game_data.get('streak', 0)}

@app.route('/')
def home():
    return render_template('index.html', **common_nav_context(active='home'))

@app.route('/profile')
def profile():
    return render_template('profile.html', **common_nav_context(active='profile'))

@app.route('/permanent')
def permanent_tasks():
    return render_template('permanent_tasks.html', **common_nav_context(active='permanent'))

@app.route('/goals')
def goals():
    return render_template('goals.html', **common_nav_context(active='goals'))

@app.route('/settings')
def settings():
    return render_template('settings.html', **common_nav_context(active='settings'))

# API endpoints
@app.route('/api/data', methods=['GET'])
def get_data():
    return jsonify(game_data)

@app.route('/api/data', methods=['POST'])
def update_data():
    payload = request.json
    game_data.update(payload)
    save_data()
    return jsonify(success=True)

# Task CRUD
@app.route('/api/tasks', methods=['POST'])
def add_task():
    task = request.json
    task['id'] = int(datetime.now().timestamp()*1000)
    task['completed'] = False
    game_data['dailyTasks'].append(task)
    save_data()
    return jsonify(task)

@app.route('/api/tasks/<int:tid>', methods=['PUT'])
def edit_task(tid):
    data = request.json
    for t in game_data['dailyTasks']:
        if t['id']==tid:
            t.update(data)
            break
    save_data()
    return jsonify(success=True)

@app.route('/api/tasks/<int:tid>', methods=['DELETE'])
def delete_task(tid):
    game_data['dailyTasks'] = [t for t in game_data['dailyTasks'] if t['id']!=tid]
    save_data()
    return jsonify(success=True)

# Permanent tasks
@app.route('/api/permanent', methods=['POST'])
def add_perm():
    task = request.json
    task['id'] = int(datetime.now().timestamp()*1000)
    if task['type']=='red':
        game_data['permanentRedTasks'].append(task)
    else:
        game_data['permanentGreenTasks'].append(task)
    save_data()
    return jsonify(task)

@app.route('/api/permanent/<string:t_type>/<int:tid>', methods=['DELETE'])
def del_perm(t_type, tid):
    key = 'permanentRedTasks' if t_type=='red' else 'permanentGreenTasks'
    game_data[key] = [t for t in game_data[key] if t['id']!=tid]
    save_data()
    return jsonify(success=True)


@app.route('/api/day/<string:date>', methods=['PUT'])
def update_day(date):
    try:
        # Validate date format
        datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid date format'}), 400

    data = request.json
    day_index = next((i for i, d in enumerate(game_data['dailyHistory']) if d['date'] == date), None)

    if day_index is not None:
        # Replace existing day data
        game_data['dailyHistory'][day_index] = {
            'date': date,
            'tasks': data.get('tasks', []),
            'points': data.get('points', 0),
            'notes': data.get('notes', ''),
            'photo': data.get('photo', '')
        }
    else:
        # Append new day data
        game_data['dailyHistory'].append({
            'date': date,
            'tasks': data.get('tasks', []),
            'points': data.get('points', 0),
            'notes': data.get('notes', ''),
            'photo': data.get('photo', '')
        })
    
    save_data()
    return jsonify(success=True)
# Submit day

    
@app.route('/api/submit-day', methods=['POST'])
def submit_day():
    payload = request.json
    date = datetime.now().strftime('%Y-%m-%d')
    points = sum(t['points'] for t in game_data['dailyTasks'] if t['completed'])
    day_record = {
        'date': date,
        'tasks': game_data['dailyTasks'],
        'points': points,
        'notes': payload.get('notes',''),
        'excuses': payload.get('excuses',{})
    }
    game_data['dailyHistory'].append(day_record)
    # update streaks
    if all(t['completed'] for t in game_data['dailyTasks']):
        game_data['streak'] += 1
        game_data['bestStreak'] = max(game_data['bestStreak'], game_data['streak'])
    else:
        game_data['streak'] = 0
    game_data['dailyTasks'] = []
    save_data()
    return jsonify(points=points, streak=game_data['streak'])

# Update goals
@app.route('/api/goals', methods=['PUT'])
def upd_goals():
    data = request.json
    game_data['goals'].update(data)
    save_data()
    return jsonify(success=True)

# Settings: reset
@app.route('/api/reset', methods=['POST'])
def reset():
    global game_data
    game_data = {
        'dailyTasks': [],
        'permanentRedTasks': [],
        'permanentGreenTasks': [],
        'dailyHistory': [],
        'goals': {'weekly':'','monthly':'','yearly':''},
        'streak':0,
        'bestStreak':0
    }
    save_data()
    return jsonify(success=True)

if __name__=='__main__':
    save_data()
    app.run(debug=True)