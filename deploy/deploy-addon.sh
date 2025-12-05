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
BASE_VERSION=${VERSION%%[-_]*}
TAIL_SUFFIX=${VERSION#"$BASE_VERSION"}
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

get_manifest_digest() {
  local ref="$1"
  local raw
  if ! raw=$(docker buildx imagetools inspect --raw "$ref" 2>/dev/null); then
    return 1
  fi

  printf '%s' "$raw" | sha256sum | awk '{print $1}'
}

latest_matches_base_version() {
  local latest_ref="${IMAGE}:latest"
  local base_ref="${IMAGE}:${BASE_VERSION}"
  local latest_digest base_digest

  if ! latest_digest=$(get_manifest_digest "$latest_ref"); then
    log "latest 태그(${latest_ref}) 조회에 실패했습니다"
    return 1
  fi

  if ! base_digest=$(get_manifest_digest "$base_ref"); then
    log "기존 기준 버전(${base_ref}) manifest를 찾을 수 없습니다"
    return 1
  fi

  if [[ "$latest_digest" != "$base_digest" ]]; then
    log "latest(${latest_ref})와 ${base_ref}의 digest가 달라 새 빌드가 필요합니다"
    return 1
  fi

  return 0
}

tag_existing_manifest() {
  log "새 빌드 없이 ${IMAGE}:${BASE_VERSION} 이미지를 ${IMAGE}:${VERSION} 태그로 복제합니다"
  docker buildx imagetools create --tag "${IMAGE}:${VERSION}" "${IMAGE}:${BASE_VERSION}" >/dev/null
}

docker_login
ensure_binfmt
ensure_builder

if [[ -n "$TAIL_SUFFIX" ]]; then
  log "tail(${TAIL_SUFFIX})을 제외한 기준 버전은 ${BASE_VERSION}입니다"
fi

if [[ -n "$TAIL_SUFFIX" ]] && latest_matches_base_version; then
  log "latest가 ${BASE_VERSION}을 가리키므로 태그만 추가합니다"
  tag_existing_manifest
else
  build_multi_arch
fi

log "배포용 이미지 생성이 완료되었습니다"
