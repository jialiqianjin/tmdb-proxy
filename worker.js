export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }
    try {
      const url = new URL(request.url)
      // 证书验证放行
      if(url.pathname.startsWith("/.well-known/acme-challenge/")){
        return env.ASSETS.fetch(request);
      }
      // 图片代理
      if (url.pathname.startsWith('/image/')) {
        return await handleImageProxy(request, url, corsHeaders)
      }
      // 全部其他路径走API代理（兼容不带/proxy前缀，donggua‑tv直接调用）
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

async function handleImageProxy(request, url, corsHeaders) {
  const imagePath = url.pathname.replace('/image', '')
  if (!imagePath) {
    return new Response(JSON.stringify({ error: 'Image path required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
  const imageUrl = `https://image.tmdb.org${imagePath}`
  const response = await fetch(imageUrl)
  if (!response.ok) {
    return new Response(JSON.stringify({
      error: 'Image not found',
      url: imageUrl
    }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const imageBuffer = await response.arrayBuffer()
  return new Response(imageBuffer, {
    status: response.status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      ...corsHeaders
    }
  })
}

async function handleApiProxy(request, url, env, corsHeaders) {
  let apiPath = url.pathname
  // 兼容两种：带/proxy前缀 和 donggua‑tv直接访问不带前缀
  if (apiPath.startsWith('/proxy')) {
    apiPath = apiPath.replace('/proxy', '')
  }

  const searchParams = new URLSearchParams(url.searchParams)
  // ⚠️重要：env.TMDB_API_KEY 在Worker页面【环境变量】设置填入 d7551814ae572a906725910f46d06288
  if (!env.TMDB_API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured in worker env' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
  searchParams.set('api_key', env.TMDB_API_KEY)

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
