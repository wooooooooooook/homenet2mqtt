#!/bin/bash
set -e

# Define PTY paths
APP_PTY_LINK="/tmp/ttyRS485-App"
SIM_PTY_LINK="/tmp/ttyRS485-Sim"

# Check if socat is installed
if ! command -v socat &> /dev/null; then
    echo "Error: 'socat' is not installed."
    echo "Please install it manually using: sudo apt-get install -y socat"
    exit 1
fi

echo "[setup-pty] Setting up PTY pair..."

# Kill existing socat processes related to these PTYs
pkill -f "socat.*$APP_PTY_LINK" || true

# Start socat in background using nohup to persist after script exit
# We use a randomized name or just rely on socat to allocate free PTYs
nohup socat -d -d pty,raw,echo=0,link=$APP_PTY_LINK,mode=666 pty,raw,echo=0,link=$SIM_PTY_LINK,mode=666 > /tmp/socat.log 2>&1 &
SOCAT_PID=$!

echo "[setup-pty] Socat started with PID $SOCAT_PID."
echo "[setup-pty] Waiting for PTYs to be created..."

# Wait loop for links to appear
MAX_RETRIES=10
COUNT=0
while [[ ! -L "$APP_PTY_LINK" || ! -L "$SIM_PTY_LINK" ]]; do
    sleep 0.5
    COUNT=$((COUNT+1))
    if [[ $COUNT -ge $MAX_RETRIES ]]; then
        echo "[setup-pty] Timeout waiting for PTY links."
        cat /tmp/socat.log
        exit 1
    fi
done

# Resolve real paths
# readlink -f might not be available on all systems, but standard on linux
REAL_APP_PTY=$(readlink -f $APP_PTY_LINK)
REAL_SIM_PTY=$(readlink -f $SIM_PTY_LINK)


# Change permissions so Docker can access them
chmod 666 "$REAL_APP_PTY" "$REAL_SIM_PTY"

echo "[setup-pty] PTYs created successfully."
echo "  App: $APP_PTY_LINK -> $REAL_APP_PTY"
echo "  Sim: $SIM_PTY_LINK -> $REAL_SIM_PTY"

# Write to .env for Docker Compose
# We use a temporary file and move it to avoid partial writes if possible, 
# but simple echo is fine.
# We expect .env to be in the CWD (project root).

ENV_FILE=".env"

# Helper to update or append env var
update_env() {
    local key=$1
    local val=$2
    if grep -q "^$key=" "$ENV_FILE"; then
        sed -i "s|^$key=.*|$key=$val|" "$ENV_FILE"
    else
        echo "$key=$val" >> "$ENV_FILE"
    fi
}

touch "$ENV_FILE"
update_env "HOST_APP_PTY" "$REAL_APP_PTY"
update_env "HOST_SIM_PTY" "$REAL_SIM_PTY"

echo "[setup-pty] Updated $ENV_FILE with PTY paths."
