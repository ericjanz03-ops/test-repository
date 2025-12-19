import os
import json
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__, static_folder='.', template_folder='.')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///local.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- Datenbank Modell ---

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_name = db.Column(db.String(50), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    fields_json = db.Column(db.Text, nullable=False, default='[]')
    # NEU: special_type markiert Kategorien mit Sonderfunktionen (z.B. 'nutrition')
    special_type = db.Column(db.String(20), nullable=True) 

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'fields': json.loads(self.fields_json),
            'special_type': self.special_type
        }

class Entry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_name = db.Column(db.String(50), nullable=False)
    type = db.Column(db.String(50), nullable=False) # Speichert 'cat_<id>'
    text = db.Column(db.String(200)) 
    val = db.Column(db.Integer, default=0) # Hauptwert für Charts (z.B. Kcal)
    details_json = db.Column(db.Text, nullable=True)
    timestamp = db.Column(db.BigInteger, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'text': self.text,
            'val': self.val,
            'details': json.loads(self.details_json) if self.details_json else {},
            'timestamp': self.timestamp
        }

with app.app_context():
    db.create_all()

# --- Helper: Standard-Kategorien erstellen ---
def init_defaults_if_needed(username):
    existing = Category.query.filter_by(user_name=username).first()
    if existing:
        return # User hat schon Kategorien

    # 1. Fitness (Manuell Werte eintragen)
    fit = Category(user_name=username, name="Fitness", special_type="fitness",
                   fields_json=json.dumps([
                       {"label": "Aktivität", "unit": ""},
                       {"label": "Verbrannt", "unit": "kcal"}
                   ]))
    
    # 2. Ernährung (Mit API Suche)
    nut = Category(user_name=username, name="Ernährung", special_type="nutrition",
                   fields_json=json.dumps([
                       {"label": "Produkt", "unit": ""},
                       {"label": "Menge", "unit": "g"},
                       {"label": "Kalorien", "unit": "kcal"} # Wichtig für API Mapping
                   ]))

    # 3. Stimmung (Als einfaches Feld)
    mood = Category(user_name=username, name="Stimmung", special_type="mood",
                    fields_json=json.dumps([
                        {"label": "Gefühl", "unit": "1-10"},
                        {"label": "Notiz", "unit": ""}
                    ]))

    db.session.add_all([fit, nut, mood])
    db.session.commit()

# --- Routen ---

@app.route('/')
def index(): return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path): return send_from_directory('.', path)

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    if data.get('username') == 'test' and data.get('password') == '1234':
        return jsonify({"success": True, "username": "test"})
    return jsonify({"success": False}), 401

@app.route('/api/categories', methods=['GET'])
def get_categories():
    username = request.args.get('user')
    if not username: return jsonify([]), 400
    
    # HIER: Prüfen und Defaults erstellen
    init_defaults_if_needed(username)
    
    cats = Category.query.filter_by(user_name=username).all()
    return jsonify([c.to_dict() for c in cats])

@app.route('/api/categories', methods=['POST'])
def add_category():
    data = request.json
    fields_str = json.dumps(data.get('fields', []))
    new_cat = Category(
        user_name=data.get('user'),
        name=data.get('name'),
        fields_json=fields_str,
        special_type='custom' # Neue User-Kategorien sind Standard
    )
    db.session.add(new_cat)
    db.session.commit()
    return jsonify(new_cat.to_dict())

@app.route('/api/entries', methods=['GET'])
def get_entries():
    username = request.args.get('user')
    entries = Entry.query.filter_by(user_name=username).order_by(Entry.timestamp.desc()).all()
    return jsonify([e.to_dict() for e in entries])

@app.route('/api/entries', methods=['POST'])
def add_entry():
    data = request.json
    new_entry = Entry(
        user_name=data.get('user'),
        type=data.get('type'),
        text=data.get('text'),
        val=data.get('val', 0),
        details_json=json.dumps(data.get('details', {})),
        timestamp=data.get('timestamp')
    )
    db.session.add(new_entry)
    db.session.commit()
    return jsonify(new_entry.to_dict())

@app.route('/api/entries/<int:id>', methods=['DELETE'])
def delete_entry(id):
    Entry.query.filter_by(id=id).delete()
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/reset', methods=['POST'])
def reset_data():
    username = request.json.get('user')
    Entry.query.filter_by(user_name=username).delete()
    Category.query.filter_by(user_name=username).delete() # Löscht auch Kategorien für sauberen Neustart
    db.session.commit()
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True)