import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const ProductContext = createContext(null)
const STORAGE_KEY = 'admin_portal_product_code'

export function ProductProvider({ children }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [productCode, setProductCode] = useState(() => localStorage.getItem(STORAGE_KEY) || 'smart-hr-plus')

  useEffect(() => {
    supabase.from('products').select('*').eq('status', 'active').order('sort_order').then(({ data }) => {
      const list = data || []
      setProducts(list)
      if (list.length && !list.some(p => p.code === productCode)) {
        selectProduct(list[0].code)
      }
      setLoading(false)
    })
  }, [])

  function selectProduct(code) {
    setProductCode(code)
    localStorage.setItem(STORAGE_KEY, code)
  }

  const current = products.find(p => p.code === productCode) || null

  return (
    <ProductContext.Provider value={{ products, productCode, current, selectProduct, loading }}>
      {children}
    </ProductContext.Provider>
  )
}

export function useProduct() {
  return useContext(ProductContext)
}
