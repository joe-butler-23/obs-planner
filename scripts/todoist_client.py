#!/usr/bin/env python3
import os
import sys
import json
import requests


class TodoistClient:
    def __init__(self):
        self.token = os.environ.get("TODOIST_TOKEN")
        if not self.token:
            for name in ["todoist_token", "TODOIST_TOKEN"]:
                path = f"/run/secrets/{name}"
                if os.path.exists(path):
                    with open(path, "r") as f:
                        self.token = f.read().strip()
                        break

        if not self.token:
            print(
                "Error: TODOIST_TOKEN environment variable or /run/secrets/todoist_token not found.",
                file=sys.stderr,
            )
            sys.exit(1)

        self.api_url = "https://api.todoist.com/rest/v2"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def list_tasks(self, project_id=None):
        params = {"project_id": project_id} if project_id else {}
        resp = requests.get(f"{self.api_url}/tasks", headers=self.headers, params=params)
        resp.raise_for_status()
        return resp.json()

    def create_task(self, content, project_id, labels=None, description=None):
        data = {"content": content, "project_id": project_id}
        if labels:
            data["labels"] = labels
        if description:
            data["description"] = description

        resp = requests.post(f"{self.api_url}/tasks", headers=self.headers, json=data)
        resp.raise_for_status()
        return resp.json()

    def delete_task(self, task_id):
        resp = requests.delete(f"{self.api_url}/tasks/{task_id}", headers=self.headers)
        resp.raise_for_status()
        return True

    def complete_task(self, task_id):
        resp = requests.post(f"{self.api_url}/tasks/{task_id}/close", headers=self.headers)
        resp.raise_for_status()
        return True

    def update_task(self, task_id, labels=None, description=None):
        data = {}
        if labels is not None:
            data["labels"] = labels
        if description is not None:
            data["description"] = description

        resp = requests.post(f"{self.api_url}/tasks/{task_id}", headers=self.headers, json=data)
        resp.raise_for_status()
        return resp.json()


def load_tasks_from_file(path):
    with open(path, "r") as f:
        payload = json.load(f)
    if not isinstance(payload, list):
        raise ValueError("Batch payload must be a JSON array.")
    return payload


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Deterministic Todoist CLI")
    parser.add_argument(
        "command",
        choices=["list", "create", "create-batch", "delete", "complete", "update"],
    )
    parser.add_argument("--project", help="Project ID")
    parser.add_argument("--content", help="Task content")
    parser.add_argument("--id", help="Task ID")
    parser.add_argument("--labels", help="Comma-separated labels")
    parser.add_argument("--description", help="Task description")
    parser.add_argument("--file", help="JSON file with tasks for batch create")

    args = parser.parse_args()
    client = TodoistClient()

    if args.command == "list":
        print(json.dumps(client.list_tasks(args.project), indent=2))
    elif args.command == "create":
        labels = args.labels.split(",") if args.labels else None
        print(json.dumps(client.create_task(args.content, args.project, labels), indent=2))
    elif args.command == "create-batch":
        if not args.project:
            raise SystemExit("create-batch requires --project")
        if not args.file:
            raise SystemExit("create-batch requires --file")
        batch = load_tasks_from_file(args.file)
        created = []
        for task in batch:
            created.append(
                client.create_task(
                    task.get("content"),
                    args.project,
                    task.get("labels"),
                    task.get("description"),
                )
            )
        print(json.dumps(created, indent=2))
    elif args.command == "update":
        labels = args.labels.split(",") if args.labels else None
        print(json.dumps(client.update_task(args.id, labels, args.description), indent=2))
    elif args.command == "delete":
        if client.delete_task(args.id):
            print(f"Deleted {args.id}")
    elif args.command == "complete":
        if client.complete_task(args.id):
            print(f"Completed {args.id}")
