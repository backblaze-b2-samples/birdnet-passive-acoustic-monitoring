"""B2 (S3-compatible) object helpers for the recordings domain.

Keeps recording-specific storage ops out of `b2_client.py` (which is near the
300-line structural ceiling). boto3/botocore stays confined to this repo layer;
the cached S3 client is reused from `b2_client` for connection pooling. All
writes/deletes invalidate the shared full-bucket listing cache so `/files` and
the dashboard reflect the change immediately.
"""

import io
import json
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.repo.b2_client import get_s3_client
from app.repo.list_cache import invalidate as _invalidate_list_cache


def put_object_bytes(key: str, data: bytes, content_type: str) -> None:
    """Upload raw bytes to B2. Raises RuntimeError on failure."""
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=key,
            Body=io.BytesIO(data),
            ContentType=content_type,
        )
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 put failed for '{key}': {e}") from e
    _invalidate_list_cache()


def put_json(key: str, obj: Any) -> None:
    """Serialize `obj` to JSON and upload it. Raises RuntimeError on failure."""
    data = json.dumps(obj, indent=2, default=str).encode("utf-8")
    put_object_bytes(key, data, "application/json")


def get_json(key: str) -> dict | None:
    """Read a JSON object from B2. Returns None if the key does not exist.

    Raises RuntimeError on any non-404 S3 failure.
    """
    client = get_s3_client()
    try:
        response = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
        return json.loads(response["Body"].read())
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return None
        raise RuntimeError(f"B2 get_json failed for '{key}': {e}") from e
    except BotoCoreError as e:
        raise RuntimeError(f"B2 get_json failed for '{key}': {e}") from e


def list_prefix(prefix: str) -> list[dict]:
    """List every object under `prefix` as [{key, size, last_modified}].

    Paginates fully (not just the first 1000 keys). Raises RuntimeError on
    failure. Reads B2 directly (not the shared cache) so a just-written
    recording is visible even inside the cache TTL window.
    """
    client = get_s3_client()
    out: list[dict] = []
    kwargs: dict = {"Bucket": settings.b2_bucket_name, "Prefix": prefix, "MaxKeys": 1000}
    try:
        while True:
            response = client.list_objects_v2(**kwargs)
            for obj in response.get("Contents", []):
                out.append(
                    {
                        "key": obj["Key"],
                        "size": obj["Size"],
                        "last_modified": obj["LastModified"],
                    }
                )
            if not response.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = response["NextContinuationToken"]
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 list failed for '{prefix}': {e}") from e
    return out


def download_to_file(key: str, dest_path: str) -> None:
    """Stream an object from B2 to a local file. Raises RuntimeError on failure.

    Streams rather than buffering so large field recordings don't sit in RAM.
    """
    client = get_s3_client()
    try:
        client.download_file(settings.b2_bucket_name, key, dest_path)
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 download failed for '{key}': {e}") from e


def delete_prefix(prefix: str) -> int:
    """Delete every object under `prefix` (batched). Returns the count deleted.

    Used for cascade-deleting a recording's whole `recordings/<id>/` subtree.
    Raises RuntimeError on failure.
    """
    objects = list_prefix(prefix)
    if not objects:
        return 0
    client = get_s3_client()
    deleted = 0
    try:
        for start in range(0, len(objects), 1000):  # S3 DeleteObjects caps at 1000
            batch = objects[start : start + 1000]
            client.delete_objects(
                Bucket=settings.b2_bucket_name,
                Delete={"Objects": [{"Key": o["key"]} for o in batch]},
            )
            deleted += len(batch)
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 delete_prefix failed for '{prefix}': {e}") from e
    _invalidate_list_cache()
    return deleted
