#!/bin/bash

# This script is designed to automate the startup of the RAGFlow backend services from source code for development purposes.
# It ensures that any existing RAGFlow backend processes are terminated before launching new ones,
# and sets up the necessary environment.

# --- Configuration ---
# Set the desired host for the backend service. Default is 0.0.0.0 for accessibility from other devices.
BACKEND_HOST="0.0.0.0"
# Set the port for the backend service. Default is 9380.
BACKEND_PORT="9380"
# Set the Hugging Face endpoint. Use a mirror for areas with restricted access.
# HF_ENDPOINT="https://hf-mirror.com"
HF_ENDPOINT=""

# --- Helper Functions ---
# Function to print messages in a standardized format.
print_message() {
    echo "-----------------------------------------------------"
    echo "$1"
    echo "-----------------------------------------------------"
}

# Function to check for and kill processes running on a specific port.
kill_process_on_port() {
    local port=$1
    # Find the PID of the process using the specified port
    local pid=$(lsof -t -i:$port)
    if [ -n "$pid" ]; then
        print_message "Terminating process with PID $pid on port $port..."
        kill -9 $pid
        # Wait a moment to ensure the process is terminated
        sleep 2
    fi
}

# --- Main Execution ---
# Navigate to the script's directory to ensure relative paths work correctly.
cd "$(dirname "$0")"

# 1. Terminate existing RAGFlow backend processes to prevent conflicts.
print_message "Shutting down existing RAGFlow backend services..."
# Kill backend services (ragflow_server.py and task_executor.py)
pkill -f "ragflow_server.py"
pkill -f "task_executor.py"
# Ensure the backend port is free.
kill_process_on_port $BACKEND_PORT
print_message "All backend services have been shut down."

# 2. Activate Python virtual environment and set environment variables.
print_message "Setting up the environment..."
# Activate Python virtual environment; exit if it fails.
source .venv/bin/activate || { echo "Failed to activate Python virtual environment."; exit 1; }
# Set PYTHONPATH to the project root for module resolution.
export PYTHONPATH=$(pwd)
# Set Hugging Face endpoint if configured.
if [ -n "$HF_ENDPOINT" ]; then
    export HF_ENDPOINT=$HF_ENDPOINT
    echo "HF_ENDPOINT set to: $HF_ENDPOINT"
fi
echo "Environment is ready."

# 3. Launch the backend services in the background.
print_message "Launching RAGFlow backend services..."
# Start the API server in the background.
python api/ragflow_server.py &
# Start the task executor in the background.
JEMALLOC_PATH=$(pkg-config --variable=libdir jemalloc)/libjemalloc.so
LD_PRELOAD=$JEMALLOC_PATH python rag/svr/task_executor.py 1 &
print_message "Backend services are starting in the background."

# --- Final ---
print_message "RAGFlow backend services startup is complete." 