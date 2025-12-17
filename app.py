import os
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

app = Flask(__name__, static_folder='.', template_folder='.')

# Konfiguration der Datenbank (Nimmt die URL von Render oder nutzt lokal SQLite zum Testen)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///local.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- Datenbank Modell ---
# Wir erstellen eine Tabelle, die alle Felder deiner JS-Objekte abdeckt
class Entry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_name = db.Column(db.String(50), nullable=False) # Um Daten pro User zu trennen
    type = db.Column(db.String(20), nullable=False)      # 'fitness', 'nutrition', 'mood'
    text = db.Column(db.String(200))
    val = db.Column(db.Integer, default=0)               # Kalorien
    score = db.Column(db.Integer, nullable=True)         # Für Mood
    icon = db.Column(db.String(10), nullable=True)       # Emoji
    note = db.Column(db.Text, nullable=True)             # Tagebuch
    timestamp = db.Column(db.BigInteger, nullable=False) # JS Timestamp

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'text': self.text,
            'val': self.val,
            'score': self.score,
            'icon': self.icon,
            'note': self.note,
            'timestamp': self.timestamp
        }

# Erstelle Tabellen beim Start (nur nötig, wenn sie noch nicht existieren)
with app.app_context():
    db.create_all()

# --- Routen (Frontend ausliefern) ---
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# --- API Endpunkte (Ersetzt localStorage) ---

# 1. Login (Simuliert)
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    # Einfacher Check wie in deinem JS
    if data.get('username') == 'test' and data.get('password') == '1234':
        return jsonify({"success": True, "username": "test"})
    return jsonify({"success": False}), 401

# 2. Daten laden
@app.route('/api/entries', methods=['GET'])
def get_entries():
    username = request.args.get('user')
    if not username:
        return jsonify([]), 400
    
    # Hole alle Einträge dieses Users aus der DB
    entries = Entry.query.filter_by(user_name=username).all()
    return jsonify([e.to_dict() for e in entries])

# 3. Neuen Eintrag speichern
@app.route('/api/entries', methods=['POST'])
def add_entry():
    data = request.json
    new_entry = Entry(
        user_name=data.get('user'),
        type=data.get('type'),
        text=data.get('text'),
        val=data.get('val', 0),
        score=data.get('score'),
        icon=data.get('icon'),
        note=data.get('note'),
        timestamp=data.get('timestamp')
    )
    db.session.add(new_entry)
    db.session.commit()
    return jsonify(new_entry.to_dict())

# 4. Eintrag löschen
@app.route('/api/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    entry = Entry.query.get(entry_id)
    if entry:
        db.session.delete(entry)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"error": "Not found"}), 404

# 5. Reset User Data
@app.route('/api/reset', methods=['POST'])
def reset_data():
    username = request.json.get('user')
    Entry.query.filter_by(user_name=username).delete()
    db.session.commit()
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True)