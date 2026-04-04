import time
import random
import threading
from src.local_db import insert_telemetry

class SimulatedDroneHardware:
    def __init__(self, device_id="D-800"):
        self.device_id = device_id
        self.battery = 100.0
        self.status = "IDLE"
        self.lat = 35.123
        self.lon = -118.456
        self.running = False
        self._thread = None

    def launch(self):
        print(f"[{self.device_id}] Hardware: LAUNCH sequence initiated.")
        self.status = "IN_MISSION"
        
    def land(self):
        print(f"[{self.device_id}] Hardware: LAND sequence initiated.")
        self.status = "IDLE"

    def _loop(self):
        while self.running:
            if self.status == "IN_MISSION":
                self.battery -= random.uniform(0.1, 0.4)
                self.lat += random.uniform(-0.001, 0.001)
                self.lon += random.uniform(-0.001, 0.001)
                
                # Rare random anomaly in flight
                anomaly = random.random() < 0.05
                
                if self.battery <= 20.0:
                    print(f"[{self.device_id}] CRITICAL BATTERY. Auto-landing.")
                    self.land()
            
            else:
                # Charging slowly while IDLE
                if self.battery < 100.0:
                    self.battery += random.uniform(0.05, 0.1)
                anomaly = False

            # ALWAYS write to local SQLite. Disconnected or not, hardware logs state.
            insert_telemetry(self.device_id, round(self.battery, 1), self.status, self.lat, self.lon, anomaly)
            
            time.sleep(1)

    def start(self):
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print(f"[{self.device_id}] Hardware loop started.")

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join()
