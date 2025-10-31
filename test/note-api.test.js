// =============================================================================
// 注意事项：
// 1. 在运行此脚本之前，请确保您的 Rafa 后端服务已经启动并正在运行。
//    例如，在 server 目录下运行 `npm run dev` 或 `npm start`。
// 2. 请替换下方的 `AUTH_COOKIE` 为您实际的认证 Cookie。
//    需要您通过浏览器开发者工具（Application -> Cookies）获取。
// 3. 此脚本会创建、更新和删除笔记，测试数据会自动删除。
// =============================================================================

// 后端服务地址修改
const BASE_URL = "http://localhost:3000/api/note";

// # 注意替换 AUTH_COOKIE
// ========================= 请替换为您的实际认证 Cookie =========================
const AUTH_COOKIE = "";

let createdNoteId = null;

/**
 * 通用请求函数
 * @param {string} url - 请求URL
 * @param {string} method - HTTP 方法 (GET, POST, PUT, DELETE)
 * @param {object} [data=null] - 请求体数据
 * @returns {Promise<object>} - 响应数据
 */
async function makeRequest(url, method, data = null) {
  console.log(`\n--- 发送 ${method} 请求到: ${url} ---`);
  const options = {
    method: method,
    headers: {
      "Content-Type": "application/json",
      Cookie: AUTH_COOKIE,
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = await response.json();

    console.log(`状态码: ${response.status}`);
    console.log("响应数据:", JSON.stringify(responseData, null, 2));

    if (!response.ok) {
      console.error(`请求失败: ${responseData.error || response.statusText}`);
      return null;
    }
    return responseData;
  } catch (error) {
    console.error("请求过程中发生错误:", error);
    return null;
  }
}

/**
 * 测试获取所有笔记 (GET /api/note)
 */
async function testGetAllNotes(stats) {
  console.log("\n=== 测试: 获取所有笔记 ===");
  const result = await makeRequest(BASE_URL, "GET");
  if (result && result.note) {
    console.log(`成功获取 ${result.note.length} 篇笔记。`);
    stats.passed++;
  } else {
    console.error("获取所有笔记失败。");
    stats.failed++;
  }
}

/**
 * 测试创建新笔记 (POST /api/note)
 */
async function testCreateNote(stats) {
  console.log("\n=== 测试: 创建新笔记 ===");
  const newNoteData = {
    title: `测试笔记 - ${new Date().toLocaleString()}`,
    content: "这是一篇通过测试脚本创建的笔记内容。",
  };
  const result = await makeRequest(BASE_URL, "POST", newNoteData);
  if (result && result.note && result.note.id) {
    createdNoteId = result.note.id;
    console.log(`成功创建笔记，ID: ${createdNoteId}`);
    stats.passed++;
  } else {
    console.error("创建笔记失败。");
    stats.failed++;
  }
}

/**
 * 测试获取单个笔记 (GET /api/note/:id)
 */
async function testGetNoteById(stats) {
  console.log("\n=== 测试: 获取单个笔记 ===");
  if (!createdNoteId) {
    console.error("没有可用的笔记ID进行查询，请先创建笔记。");
    stats.failed++;
    return;
  }
  const url = `${BASE_URL}/${createdNoteId}`;
  const result = await makeRequest(url, "GET");
  if (result && result.note) {
    console.log(`成功获取笔记，标题: "${result.note.title}"`);
    stats.passed++;
  } else {
    console.error(`获取ID为 ${createdNoteId} 的笔记失败。`);
    stats.failed++;
  }
}

/**
 * 测试更新笔记 (PUT /api/note/:id)
 */
async function testUpdateNote(stats) {
  console.log("\n=== 测试: 更新笔记 ===");
  if (!createdNoteId) {
    console.error("没有可用的笔记ID进行更新，请先创建笔记。");
    stats.failed++;
    return;
  }
  const updateData = {
    title: `更新后的测试笔记 - ${new Date().toLocaleString()}`,
    content: "这是更新后的笔记内容。",
    starred: true,
  };
  const url = `${BASE_URL}/${createdNoteId}`;
  const result = await makeRequest(url, "PUT", updateData);
  if (result && result.note) {
    console.log(
      `成功更新笔记，ID: ${result.note.id}, 新标题: "${result.note.title}"`
    );
    stats.passed++;
  } else {
    console.error(`更新ID为 ${createdNoteId} 的笔记失败。`);
    stats.failed++;
  }
}

/**
 * 测试删除笔记 (DELETE /api/note/:id)
 */
async function testDeleteNote(stats) {
  console.log("\n=== 测试: 删除笔记 ===");
  if (!createdNoteId) {
    console.error("没有可用的笔记ID进行删除，请先创建笔记。");
    stats.failed++;
    return;
  }
  const url = `${BASE_URL}/${createdNoteId}`;
  const result = await makeRequest(url, "DELETE");
  if (result && result.success) {
    console.log(`成功删除笔记，ID: ${createdNoteId}`);
    createdNoteId = null; // 清除ID
    stats.passed++;
  } else {
    console.error(`删除ID为 ${createdNoteId} 的笔记失败。`);
    stats.failed++;
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log("--- 开始运行笔记API测试 ---");

  if (AUTH_COOKIE === "YOUR_AUTH_COOKIE_HERE" || !AUTH_COOKIE) {
    console.error(
      "\n错误: AUTH_COOKIE 未设置。请在脚本顶部替换为您实际的认证 Cookie。"
    );
    console.log("\n--- 笔记API测试运行结束 ---");
    return;
  }

  const stats = { passed: 0, failed: 0 };

  await testGetAllNotes(stats);
  await testCreateNote(stats);
  await testGetNoteById(stats);
  await testUpdateNote(stats);
  await testDeleteNote(stats);

  console.log("\n--- 笔记API测试运行结束 ---");
  console.log(`\n测试结果: 通过 ${stats.passed} 个, 未通过 ${stats.failed} 个`);
}

// 启动测试
runAllTests();
