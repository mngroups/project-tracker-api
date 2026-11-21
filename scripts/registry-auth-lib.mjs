export function normalizeGroupId(groupId) {
  if (typeof groupId !== "string" || !/^\d+$/.test(groupId.trim())) {
    throw new Error("GITLAB_PACKAGE_GROUP_ID must be a numeric GitLab group ID.");
  }

  return groupId.trim();
}

export function validateRegistryCredentials({ groupId, token }) {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (typeof token !== "string" || token.trim() === "") {
    throw new Error("A non-empty GitLab npm token is required.");
  }

  const normalizedToken = token.trim();
  if (/[\r\n]/.test(normalizedToken)) {
    throw new Error("The GitLab npm token must not contain line breaks.");
  }

  return { groupId: normalizedGroupId, token: normalizedToken };
}

export function renderRegistryConfig(template, credentials) {
  const { groupId, token } = validateRegistryCredentials(credentials);
  const config = template
    .replaceAll("${GITLAB_PACKAGE_GROUP_ID}", () => groupId)
    .replaceAll("${GITLAB_NPM_TOKEN}", () => token);

  if (config.includes("${GITLAB_")) {
    throw new Error("The npm registry template contains an unresolved GitLab variable.");
  }

  return config;
}
