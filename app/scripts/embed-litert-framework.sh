#!/bin/sh
set -eu

# RN 0.88 attaches the Swift package to the pod but does not embed its dynamic
# binary dependency in the application. Run after linking, before app signing.
source_framework=""
for candidate in \
  "${BUILT_PRODUCTS_DIR}/PackageFrameworks/CLiteRTLM.framework" \
  "${BUILT_PRODUCTS_DIR}/CLiteRTLM.framework"; do
  if [ -f "$candidate/CLiteRTLM" ]; then
    source_framework="$candidate"
    break
  fi
done
if [ -z "$source_framework" ]; then
  echo "error: LiteRT-LM is enabled but its built CLiteRTLM.framework is missing." >&2
  exit 1
fi

destination="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}"
mkdir -p "$destination"
/usr/bin/ditto "$source_framework" "$destination/CLiteRTLM.framework"
if [ "${CODE_SIGNING_ALLOWED:-YES}" != "NO" ] && [ -n "${EXPANDED_CODE_SIGN_IDENTITY:-}" ]; then
  /usr/bin/codesign --force --sign "$EXPANDED_CODE_SIGN_IDENTITY" \
    --preserve-metadata=identifier,entitlements "$destination/CLiteRTLM.framework"
  /usr/bin/codesign --verify "$destination/CLiteRTLM.framework"
fi
test -f "$destination/CLiteRTLM.framework/CLiteRTLM"
echo "Embedded CLiteRTLM.framework in the application."
