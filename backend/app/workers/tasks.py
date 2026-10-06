"""
TaskFlow Task Registry.

All executable tasks are defined here. Workers only execute registered tasks.
No arbitrary code execution from user input is permitted.
"""

import time
import random
import math
from typing import Any, Callable

from app.core.logging import logger


# ─────────────── Task implementations ───────────────

def echo_task(payload: dict) -> dict:
    """Echo the message back."""
    message = payload.get("message", "No message provided")
    return {"echoed": message, "length": len(message)}


def sleep_task(payload: dict) -> dict:
    """Sleep for a given number of seconds (max 60)."""
    seconds = min(float(payload.get("seconds", 1)), 60)
    time.sleep(seconds)
    return {"slept_for": seconds, "message": f"Slept for {seconds} seconds"}


def calculate_task(payload: dict) -> dict:
    """Perform a mathematical calculation."""
    operation = payload.get("operation", "add")
    a = float(payload.get("a", 0))
    b = float(payload.get("b", 0))

    if operation == "add":
        result = a + b
    elif operation == "subtract":
        result = a - b
    elif operation == "multiply":
        result = a * b
    elif operation == "divide":
        if b == 0:
            raise ValueError("Division by zero")
        result = a / b
    elif operation == "power":
        result = math.pow(a, b)
    elif operation == "sqrt":
        if a < 0:
            raise ValueError("Cannot take square root of negative number")
        result = math.sqrt(a)
    else:
        raise ValueError(f"Unknown operation: {operation}")

    return {"operation": operation, "a": a, "b": b, "result": result}


def random_failure_task(payload: dict) -> dict:
    """Randomly fails to demonstrate retry behavior."""
    failure_rate = float(payload.get("failure_rate", 0.5))
    if random.random() < failure_rate:
        raise RuntimeError(f"Random failure triggered (rate={failure_rate})")
    return {"message": "Task succeeded (despite randomness)", "failure_rate": failure_rate}


def generate_report_task(payload: dict) -> dict:
    """Simulate generating a report."""
    report_type = payload.get("report_type", "summary")
    rows = int(payload.get("rows", 100))
    
    # Simulate processing time
    time.sleep(min(rows / 1000, 5))
    
    return {
        "report_type": report_type,
        "rows_processed": rows,
        "status": "generated",
        "filename": f"report_{report_type}_{int(time.time())}.csv",
        "size_bytes": rows * 128,
    }


def data_transform_task(payload: dict) -> dict:
    """Simulate a data transformation."""
    input_data = payload.get("data", [])
    transform = payload.get("transform", "uppercase")
    
    if transform == "uppercase":
        result = [str(item).upper() for item in input_data]
    elif transform == "lowercase":
        result = [str(item).lower() for item in input_data]
    elif transform == "reverse":
        result = [str(item)[::-1] for item in input_data]
    elif transform == "count":
        result = {"count": len(input_data)}
    else:
        raise ValueError(f"Unknown transform: {transform}")
    
    return {"transform": transform, "input_count": len(input_data), "output": result}


def send_notification_task(payload: dict) -> dict:
    """Simulate sending a notification."""
    channel = payload.get("channel", "email")
    recipient = payload.get("recipient", "unknown")
    message = payload.get("message", "No message")
    
    # Simulate network delay
    time.sleep(0.5)
    
    return {
        "channel": channel,
        "recipient": recipient,
        "message_preview": message[:100],
        "delivered": True,
        "timestamp": time.time(),
    }


# ─────────────── Registry ───────────────

TASK_REGISTRY: dict[str, Callable[[dict], Any]] = {
    "echo_task": echo_task,
    "sleep_task": sleep_task,
    "calculate_task": calculate_task,
    "random_failure_task": random_failure_task,
    "generate_report_task": generate_report_task,
    "data_transform_task": data_transform_task,
    "send_notification_task": send_notification_task,
}


def get_registered_tasks() -> list[str]:
    """Return list of registered task type names."""
    return list(TASK_REGISTRY.keys())


def execute_task(task_type: str, payload: dict) -> Any:
    """Execute a registered task. Raises ValueError for unknown types."""
    if task_type not in TASK_REGISTRY:
        raise ValueError(f"Unknown task type: '{task_type}'. Registered: {get_registered_tasks()}")
    
    task_fn = TASK_REGISTRY[task_type]
    logger.info(f"Executing task '{task_type}' with payload keys: {list(payload.keys())}")
    return task_fn(payload)
