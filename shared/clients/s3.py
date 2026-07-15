import aioboto3


async def upload_object(
    *,
    bucket: str,
    key: str,
    body: bytes,
    content_type: str,
    region: str,
    access_key_id: str,
    secret_access_key: str,
    endpoint_url: str = "",
) -> None:
    session = aioboto3.Session()
    async with session.client(
        "s3",
        region_name=region,
        aws_access_key_id=access_key_id or None,
        aws_secret_access_key=secret_access_key or None,
        endpoint_url=endpoint_url or None,
    ) as s3:
        await s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type)


def build_public_url(*, bucket: str, region: str, key: str) -> str:
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
