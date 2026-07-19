from typing import List
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_environment: str = "development"
    log_level: str = "INFO"
    require_redis: bool = False
    database_url: str
    frontend_url: str = "https://omlu.vercel.app"
    public_frontend_url: str = "https://omlu.vercel.app"
    # FRONTEND_URLS: comma-separated list of allowed CORS origins (no wildcard with credentials)
    frontend_urls: str = "https://omlu.vercel.app,http://localhost:3000,http://127.0.0.1:3000"
    kitchen_api_key: str
    jwt_secret_key: str   # Required secret key for staff JWT token authentication
    jwt_algorithm: str = "HS256"
    jwt_access_token_minutes: int = 480
    redis_url: str | None = None
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str = "mailto:ops@omlu.app"
    customer_push_ttl_seconds: int = 60 * 60 * 12
    realtime_max_connections: int = 5000
    realtime_max_connections_per_session: int = 20
    realtime_max_connections_per_ip: int = 100

    @property
    def allowed_origins(self) -> List[str]:
        """Parse comma-separated FRONTEND_URLS into a list of explicit CORS origins.
        Never use wildcard (*) with allow_credentials=True.
        """
        origins = [o.strip() for o in self.frontend_urls.split(",") if o.strip()]
        if self.app_environment != "production":
            for dev_origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
                if dev_origin not in origins:
                    origins.append(dev_origin)
        return origins

    @model_validator(mode="after")
    def validate_production(self):
        if self.app_environment == "production":
            if len(self.jwt_secret_key) < 32:
                raise ValueError("JWT_SECRET_KEY must be at least 32 characters in production")
            if "*" in self.allowed_origins or any("localhost" in origin for origin in self.allowed_origins):
                raise ValueError("FRONTEND_URLS must contain only explicit production origins")
            if not self.public_frontend_url.startswith("https://"):
                raise ValueError("PUBLIC_FRONTEND_URL must use HTTPS in production")
            if self.require_redis and not self.redis_url:
                raise ValueError("REDIS_URL is required when REQUIRE_REDIS=true")
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
