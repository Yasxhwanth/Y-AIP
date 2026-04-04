import sqlite3
import os
import time

DB_PATH = os.getenv("EDGE_DB_PATH", "edge_local.db")

def get_connection():
    return sqlite3.connect(DB_PATH)

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Telemetry Buffer Table for Disconnected Operations
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS edge_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL,
            device_id TEXT,
            battery REAL,
            status TEXT,
            lat REAL,
            lon REAL,
            anomaly_detected INTEGER,
            synced INTEGER DEFAULT 0
        )
    ''')
    
    # Mission State Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS local_state (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    
    conn.commit()
    conn.close()
    
def insert_telemetry(device_id, battery, status, lat, lon, anomaly=False):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO edge_telemetry (timestamp, device_id, battery, status, lat, lon, anomaly_detected, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    ''', (time.time(), device_id, battery, status, lat, lon, 1 if anomaly else 0))
    conn.commit()
    conn.close()

def get_unsynced_telemetry(limit=50):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM edge_telemetry WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?', (limit,))
    rows = cursor.fetchall()
    
    # Get column names
    column_names = [description[0] for description in cursor.description]
    conn.close()
    
    # Convert to list of dicts
    return [dict(zip(column_names, row)) for row in rows]

def mark_as_synced(ids):
    if not ids: return
    conn = get_connection()
    cursor = conn.cursor()
    placeholders = ','.join(['?'] * len(ids))
    cursor.execute(f'UPDATE edge_telemetry SET synced = 1 WHERE id IN ({placeholders})', ids)
    conn.commit()
    conn.close()

# Initialize upon import
init_db()
