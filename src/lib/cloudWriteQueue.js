/**
 * 云端整记录写入的串行化队列。
 *
 * 凡是「整份记录一次性 upsert」的云端存储（custom_library 各 lib_key），并发写会在服务端
 * 乱序落地：upsert 是无条件覆盖，后发但内容更旧的快照若晚到，会盖掉先发但内容更新的快照，
 * 而两者 updated_at 可能同毫秒，客户端按时间合并也判为相同、永不修复——表现为本地正确、
 * 云端静默缺一半内容。本队列保证同一 key 的写入按入队顺序逐个完成，使最后一次（最完整）
 * 快照必然最后落地。不同 key 互不阻塞。
 */
const queues = new Map()

/**
 * @param {string} key 串行化分组键（通常为 lib_key，如 `module_library_<mod>`）
 * @param {() => Promise<any>} task 实际写入任务
 * @returns {Promise<any>} 本次任务的结果（失败时 reject，调用方可自行 catch）
 */
export function enqueueCloudWrite(key, task) {
  const prev = queues.get(key) ?? Promise.resolve()
  const run = prev.then(() => task())
  // 链尾吞掉错误，保证一次失败不阻断后续写入；调用方仍通过 run 拿到本次成败
  queues.set(key, run.then(() => {}, () => {}))
  return run
}
