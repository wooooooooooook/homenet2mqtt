#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE="$ROOT_DIR/deploy/docker/.env"
DOCKER_CONFIG_DIR=$(mktemp -d)
export DOCKER_CONFIG=$DOCKER_CONFIG_DIR
trap 'rm -rf "$DOCKER_CONFIG_DIR"' EXIT
IMAGE="nubiz/homenet2mqtt"
PLATFORMS=("linux/amd64" "linux/arm64")
BUILDER_NAME="addon-multiarch"
NPM_REGISTRY_DEFAULT="https://registry.npmjs.org"

log() {
  printf '\n[deploy-addon] %s\n' "$1"
}

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  log ".env 파일($ENV_FILE)을 찾을 수 없습니다. 필요한 환경 변수를 직접 내보내세요."
fi

: "${DOCKERHUB_USERNAME:?DOCKERHUB_USERNAME가 필요합니다}"
: "${DOCKERHUB_TOKEN:?DOCKERHUB_TOKEN가 필요합니다}"

VERSION=$(grep '^version:' "$ROOT_DIR/hassio-addon/config.yaml" | awk '{print $2}' | tr -d '"\r' | xargs)
NPM_REGISTRY=${NPM_REGISTRY:-$NPM_REGISTRY_DEFAULT}

docker_login() {
  log "Docker Hub에 로그인합니다"
  printf '%s' "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin >/dev/null
}

ensure_binfmt() {
  log "binfmt QEMU 에뮬레이터를 설치/갱신합니다"
  docker run --rm --privileged tonistiigi/binfmt --install all >/dev/null
}

ensure_builder() {
  if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    log "새 buildx 빌더($BUILDER_NAME)를 생성합니다"
    docker buildx create --name "$BUILDER_NAME" --use >/dev/null
  else
    log "기존 빌더($BUILDER_NAME)를 사용합니다"
    docker buildx use "$BUILDER_NAME" >/dev/null
  fi
}

build_multi_arch() {
  local platforms_csv
  platforms_csv=$(IFS=','; printf '%s' "${PLATFORMS[*]}")

  log "멀티 아키텍처 빌드를 ${platforms_csv} 대상으로 시작합니다"
  docker buildx build \
    --builder "$BUILDER_NAME" \
    --platform "$platforms_csv" \
    --file "$ROOT_DIR/hassio-addon/Dockerfile" \
    --build-arg "NPM_REGISTRY=${NPM_REGISTRY}" \
    --tag "${IMAGE}:${VERSION}" \
    --tag "${IMAGE}:latest" \
    --push \
    "$ROOT_DIR"
}

docker_login
ensure_binfmt
ensure_builder

build_multi_arch

log "배포용 이미지 생성이 완료되었습니다"
