"""Tests for task registry and execution."""
import pytest
from app.workers.tasks import execute_task, get_registered_tasks


def test_registered_tasks():
    tasks = get_registered_tasks()
    assert "echo_task" in tasks
    assert "sleep_task" in tasks
    assert "calculate_task" in tasks
    assert "random_failure_task" in tasks
    assert "generate_report_task" in tasks


def test_echo_task():
    result = execute_task("echo_task", {"message": "Hello TaskFlow"})
    assert result["echoed"] == "Hello TaskFlow"
    assert result["length"] == 14


def test_calculate_task_add():
    result = execute_task("calculate_task", {"operation": "add", "a": 5, "b": 3})
    assert result["result"] == 8


def test_calculate_task_divide_by_zero():
    with pytest.raises(ValueError, match="Division by zero"):
        execute_task("calculate_task", {"operation": "divide", "a": 10, "b": 0})


def test_unknown_task_type():
    with pytest.raises(ValueError, match="Unknown task type"):
        execute_task("not_a_real_task", {})


def test_data_transform_uppercase():
    result = execute_task("data_transform_task", {
        "data": ["hello", "world"],
        "transform": "uppercase"
    })
    assert result["output"] == ["HELLO", "WORLD"]
