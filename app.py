import os
import uuid
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='.', template_folder='.')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///local.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- MODELLE ---

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Session(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(36), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    
    user = db.relationship('User', backref='sessions')

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    fields = db.relationship('CategoryField', backref='category', cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'fields': [f.to_dict() for f in self.fields]
        }

class CategoryField(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=False)
    label = db.Column(db.String(50), nullable=False)
    data_type = db.Column(db.String(20), nullable=False) # 'text', 'number'
    unit = db.Column(db.String(20))

    def to_dict(self):
        return {'id': self.id, 'label': self.label, 'unit': self.unit, 'data_type': self.data_type}

class Entry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=False)
    occurred_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    values = db.relationship('EntryValue', backref='entry', cascade="all, delete-orphan")
    category = db.relationship('Category')

    def to_dict(self):
        details_obj = {}
        # Wir bauen die Details zusammen
        for val in self.values:
            # Feld-Definition laden um Label und Unit zu bekommen
            field_def = CategoryField.query.get(val.field_id)
            if field_def:
                raw_val = val.value_text if val.value_text is not None else val.value_number
                # Formatierung für Frontend
                display_val = f"{raw_val} {field_def.unit}" if field_def.unit else str(raw_val)
                details_obj[field_def.label] = display_val

        return {
            'id': self.id,
            'type': f"cat_{self.category_id}",
            'text': self.category.name,
            'details': details_obj,
            'timestamp': int(self.occurred_at.timestamp() * 1000)
        }

class EntryValue(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    entry_id = db.Column(db.Integer, db.ForeignKey('entry.id'), nullable=False)
    field_id = db.Column(db.Integer, db.ForeignKey('category_field.id'), nullable=False)
    
    value_text = db.Column(db.String(500))
    value_number = db.Column(db.Float)

with app.app_context():
    db.create_all()

# --- HELPER: Defaults erstellen ---

def create_default_categories(user_id):
    """Erstellt die Standard-Kategorien für einen neuen User"""
    
    # 1. Fitness
    cat_fit = Category(user_id=user_id, name="Fitness", description="Workouts tracken")
    db.session.add(cat_fit)
    db.session.flush() # ID generieren
    
    db.session.add(CategoryField(category_id=cat_fit.id, label="Aktivität", data_type="text"))
    db.session.add(CategoryField(category_id=cat_fit.id, label="Dauer", data_type="number", unit="min"))
    db.session.add(CategoryField(category_id=cat_fit.id, label="Verbrannt", data_type="number", unit="kcal"))

    # 2. Ernährung
    cat_nut = Category(user_id=user_id, name="Ernährung", description="Essen tracken")
    db.session.add(cat_nut)
    db.session.flush()

    db.session.add(CategoryField(category_id=cat_nut.id, label="Produkt", data_type="text"))
    db.session.add(CategoryField(category_id=cat_nut.id, label="Menge", data_type="number", unit="g"))
    db.session.add(CategoryField(category_id=cat_nut.id, label="Kalorien", data_type="number", unit="kcal"))

    # 3. Stimmung
    cat_mood = Category(user_id=user_id, name="Stimmung", description="Wie fühlst du dich?")
    db.session.add(cat_mood)
    db.session.flush()

    db.session.add(CategoryField(category_id=cat_mood.id, label="Gefühl", data_type="number", unit="1-10"))
    db.session.add(CategoryField(category_id=cat_mood.id, label="Notiz", data_type="text"))

    db.session.commit()

# --- AUTH HELPER ---
def get_user_from_token():
    auth_header = request.headers.get('Authorization')
    if not auth_header: return None
    token = auth_header.replace('Bearer ', '')
    session = Session.query.filter_by(token=token).first()
    if session and session.expires_at > datetime.utcnow():
        return session.user
    return None

# --- ROUTEN ---

@app.route('/')
def index(): return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path): return send_from_directory('.', path)

# Registrierung (MIT DEFAULT CREATION)
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    if User.query.filter_by(username=data['username']).first():
        return jsonify({"error": "User existiert bereits"}), 400
    
    hashed = generate_password_hash(data['password'])
    new_user = User(username=data['username'], email=data.get('email', 'none'), password_hash=hashed)
    
    db.session.add(new_user)
    db.session.commit()
    
    # HIER: Defaults anlegen!
    create_default_categories(new_user.id)
    
    return jsonify({"success": True})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data['username']).first()
    
    if user and check_password_hash(user.password_hash, data['password']):
        Session.query.filter(Session.expires_at < datetime.utcnow()).delete()
        token = str(uuid.uuid4())
        expires = datetime.utcnow() + timedelta(days=30)
        db.session.add(Session(token=token, user_id=user.id, expires_at=expires))
        db.session.commit()
        return jsonify({"success": True, "token": token, "username": user.username})
    
    return jsonify({"success": False}), 401

@app.route('/api/categories', methods=['GET'])
def get_categories():
    user = get_user_from_token()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    cats = Category.query.filter_by(user_id=user.id).all()
    return jsonify([c.to_dict() for c in cats])

@app.route('/api/categories', methods=['POST'])
def add_category():
    user = get_user_from_token()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    
    new_cat = Category(user_id=user.id, name=data['name'], description=data.get('desc'))
    db.session.add(new_cat)
    db.session.flush()

    for f in data.get('fields', []):
        db.session.add(CategoryField(
            category_id=new_cat.id,
            label=f['label'],
            unit=f.get('unit'),
            data_type=f.get('data_type', 'text')
        ))
    
    db.session.commit()
    return jsonify(new_cat.to_dict())

@app.route('/api/entries', methods=['GET'])
def get_entries():
    user = get_user_from_token()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    entries = Entry.query.filter_by(user_id=user.id).order_by(Entry.occurred_at.desc()).all()
    return jsonify([e.to_dict() for e in entries])

@app.route('/api/entries', methods=['POST'])
def add_entry():
    user = get_user_from_token()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    
    try:
        cat_id = int(data['type'].split('_')[1])
    except:
        return jsonify({"error": "Invalid Type"}), 400

    new_entry = Entry(
        user_id=user.id,
        category_id=cat_id,
        occurred_at=datetime.fromtimestamp(data['timestamp'] / 1000.0)
    )
    db.session.add(new_entry)
    db.session.flush()

    category = Category.query.get(cat_id)
    for label, val_string in data.get('details', {}).items():
        field = next((f for f in category.fields if f.label == label), None)
        if field:
            val_entry = EntryValue(entry_id=new_entry.id, field_id=field.id)
            if field.data_type == 'number':
                try:
                    val_entry.value_number = float(val_string)
                except:
                    val_entry.value_text = val_string # Fallback
            else:
                val_entry.value_text = val_string
            db.session.add(val_entry)

    db.session.commit()
    return jsonify(new_entry.to_dict())

@app.route('/api/entries/<int:id>', methods=['DELETE'])
def delete_entry(id):
    user = get_user_from_token()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    Entry.query.filter_by(id=id, user_id=user.id).delete()
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/reset', methods=['POST'])
def reset_data():
    user = get_user_from_token()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    
    # Lösche alles vom User
    Entry.query.filter_by(user_id=user.id).delete()
    Category.query.filter_by(user_id=user.id).delete()
    db.session.commit()
    
    # Erstelle Defaults neu
    create_default_categories(user.id)
    
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True)