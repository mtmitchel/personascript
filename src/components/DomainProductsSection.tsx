import React, { useState, useEffect } from 'react';
import { DomainExpertise, ProductReference } from '../types';
import { Package, Plus } from 'lucide-react';

interface DomainProductsSectionProps {
  localExpertise: DomainExpertise;
  saveExpertise: (updated: DomainExpertise) => void;
}

export const DomainProductsSection: React.FC<DomainProductsSectionProps> = ({
  localExpertise,
  saveExpertise,
}) => {
  const [focusProductId, setFocusProductId] = useState<string | null>(null);

  useEffect(() => {
    if (focusProductId) {
      document.getElementById(`product-name-${focusProductId}`)?.focus();
      setFocusProductId(null);
    }
  }, [focusProductId, localExpertise.productKnowledge]);

  const createLocalProductId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `product-${crypto.randomUUID()}`;
    }
    return `product-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  const handleAddProduct = () => {
    const newId = createLocalProductId();
    const newProduct: ProductReference = {
      id: newId,
      name: '',
      notes: '',
      enabled: true,
    };
    saveExpertise({
      ...localExpertise,
      productKnowledge: [...(localExpertise.productKnowledge || []), newProduct],
    });
    setFocusProductId(newId);
  };

  const handleUpdateProduct = (id: string, updates: Partial<ProductReference>) => {
    const updated = (localExpertise.productKnowledge || []).map((p) =>
      p.id === id ? { ...p, ...updates } : p
    );
    saveExpertise({
      ...localExpertise,
      productKnowledge: updated,
    });
  };

  const handleDeleteProduct = (id: string) => {
    const target = (localExpertise.productKnowledge || []).find((p) => p.id === id);
    const label = target?.name ? ` "${target.name}"` : '';
    if (!window.confirm(`Remove product${label}? This cannot be undone.`)) return;

    const updated = (localExpertise.productKnowledge || []).filter((p) => p.id !== id);
    saveExpertise({
      ...localExpertise,
      productKnowledge: updated,
    });
  };

  const products = localExpertise.productKnowledge || [];
  const hasProducts = products.length > 0;

  return (
    <div
      className={`bg-white rounded-xl border border-neutral-200 p-5 space-y-4 transition-opacity ${
        !localExpertise.enabled ? 'opacity-50' : ''
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-neutral-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-neutral-800" />
            <h2 className="text-base font-semibold text-neutral-900">Products</h2>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
              Reference notes
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
            Add what the model should know about a product. Include sources and dates when they matter. Enable the references relevant to your draft.
          </p>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            These notes help interpret product details. The review can flag possible conflicts; check its suggestions before changing facts.
          </p>
        </div>

        {hasProducts && (
          <button
            type="button"
            id="btn-add-product"
            onClick={handleAddProduct}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition shadow-2xs shrink-0 self-start"
          >
            <Plus className="w-3.5 h-3.5 text-neutral-600" />
            <span>Add product</span>
          </button>
        )}
      </div>

      {!hasProducts ? (
        <div className="p-6 rounded-xl bg-neutral-50/70 border border-dashed border-neutral-300 text-center space-y-2">
          <Package className="w-6 h-6 text-neutral-500 mx-auto" />
          <div className="text-xs font-medium text-neutral-700">No product references added yet</div>
          <p className="text-[11px] text-neutral-500 max-w-md mx-auto">
            Add a product, such as DeepL Translator or DeepL Write, and describe what it does.
          </p>
          <button
            type="button"
            id="btn-add-product"
            onClick={handleAddProduct}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-800 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-neutral-600" />
            <span>Add product</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <div
              key={product.id}
              className={`p-4 rounded-xl border transition-all ${
                product.enabled
                  ? 'bg-white border-neutral-300 shadow-xs'
                  : 'bg-neutral-50/70 border-neutral-200 '
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    id={`toggle-product-${product.id}`}
                    aria-label={`Enable product ${product.name || 'entry'}`}
                    checked={product.enabled}
                    onChange={(e) => handleUpdateProduct(product.id, { enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 accent-neutral-900 cursor-pointer"
                  />
                  <input
                    type="text"
                    id={`product-name-${product.id}`}
                    aria-label="Product name"
                    value={product.name}
                    onChange={(e) => handleUpdateProduct(product.id, { name: e.target.value })}
                    placeholder="e.g. DeepL Translator"
                    className="text-xs font-semibold text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-neutral-900 focus:outline-none px-1 py-0.5 w-full max-w-sm"
                  />
                </div>

                <button
                  type="button"
                  id={`btn-delete-product-${product.id}`}
                  aria-label={`Remove product ${product.name || 'entry'}`}
                  onClick={() => handleDeleteProduct(product.id)}
                  className="text-xs text-rose-600 hover:text-rose-800 font-medium transition"
                  title="Remove product entry"
                >
                  Remove
                </button>
              </div>

              <div className="mt-2.5 pl-6.5">
                <label htmlFor={`product-notes-${product.id}`} className="text-[11px] font-medium text-neutral-700 block mb-1">
                  Reference notes
                </label>
                <textarea
                  id={`product-notes-${product.id}`}
                  aria-label="Reference notes"
                  rows={4}
                  value={product.notes}
                  onChange={(e) => handleUpdateProduct(product.id, { notes: e.target.value })}
                  placeholder="What does this product do? Add relevant features, naming, sources, and dates."
                  className="w-full text-xs p-2 bg-neutral-50 rounded-lg border border-neutral-200 focus:bg-white focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 resize-y leading-relaxed"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
