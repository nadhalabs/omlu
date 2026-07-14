from pydantic import BaseModel, Field, HttpUrl


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=16, max_length=4096)
    auth: str = Field(min_length=8, max_length=4096)


class CustomerPushSubscriptionRequest(BaseModel):
    endpoint: HttpUrl
    keys: PushSubscriptionKeys


class CustomerPushConfigResponse(BaseModel):
    enabled: bool
    public_key: str | None = None


class CustomerPushSubscriptionResponse(BaseModel):
    status: str
