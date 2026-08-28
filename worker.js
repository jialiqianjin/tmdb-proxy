export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    }
    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }
    try {
      const url = new URL(request.url)
      
      // 适配冬瓜TV原生 /t/p/ 图片路径，移除/image前缀判断
      if (url.pathname.startsWith('/t/p/')) {
        return await handleImageProxy(request, url, corsHeaders)
      }
      
      // API 代理处理
      return await handleApiProxy(request, url, env, corsHeaders)
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: 'Proxy error', 
        message: error.message 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
    }
  }
}
// 处理图片代理
async function handleImageProxy(request, url, corsHeaders) {
  // 直接使用原生/t/p路径，不再截取/image
  const imagePath = url.pathname
  
  if (!imagePath) {
    return new Response(JSON.stringify({ error: 'Image path required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
  // 构建 TMDB 图片 URL
  const imageUrl = `https://image.tmdb.org${imagePath}`
  
  // 防盗链头设置，解决401
  const newHeaders = new Headers(request.headers);
  newHeaders.delete("X-TMDB-API-Key");
  newHeaders.set("Referer", "https://www.themoviedb.org");
  // 获取图片
  const response = await fetch(imageUrl, {
    method: request.method,
    headers: newHeaders,
    redirect: "follow"
  })
  
  if (!response.ok) {
    return new Response(JSON.stringify({ 
      error: 'Image not found',
      url: imageUrl 
    }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
  // 创建响应并设置正确的 Content‑Type
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const imageBuffer = await response.arrayBuffer()
  
  return new Response(imageBuffer, {
    status: response.status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400', // 缓存1天
      ...corsHeaders
    }
  })
}
// 处理 API 代理
async function handleApiProxy(request, url, env, corsHeaders) {
  let apiPath = url.pathname

  // 新增：剔除donggua‑tv带过来多余的 /3 前缀，防止双重/3
  if(apiPath.startsWith("/3")){
    apiPath = apiPath.slice(2);
  }

  // 去掉代理前缀
  if (apiPath.startsWith('/proxy')) {
    apiPath = apiPath.replace('/proxy', '')
  }
  
  const searchParams = new URLSearchParams(url.searchParams)
  
  // 从环境变量获取 API 密钥
  if (env.TMDB_API_KEY) {
    searchParams.set('api_key', env.TMDB_API_KEY)
  } else {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
  
  const apiUrl = `https://api.themoviedb.org/3${apiPath}?${searchParams}`
  const response = await fetch(apiUrl, {
    method: request.method,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    }
  })
  const modifiedResponse = new Response(response.body, response)
  Object.entries(corsHeaders).forEach(([key, value]) => {
    modifiedResponse.headers.set(key, value)
  })
  return modifiedResponse
}
