//Nilesh, 31-10-2026, one server-side listing helper for every table endpoint

//Nilesh, 31-10-2026, escape user search text so it can never become a regex payload
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//Nilesh, 31-10-2026, build an $or of case-insensitive matches across allowlisted fields
const searchFilter = (search, fields) =>
  search && fields.length
    ? { $or: fields.map((f) => ({ [f]: { $regex: escapeRegex(search), $options: "i" } })) }
    : {};

/**
 * //Nilesh, 31-10-2026, paginate a model → { items, pagination }
 * query        validated output of validators.listQuery (page/pageSize/search/sortBy/sortOrder)
 * filter       server-built filter (never raw client input)
 * searchFields fields `search` matches against
 * select       projection = table DTO fields only
 * toDTO        row mapper so raw documents never leave the API
 * Tenant scoping is added by the tenant plugin on tenant-owned models.
 */
export const paginate = async (Model, { query, filter = {}, searchFields = [], select, toDTO = (x) => x }) => {
  const { page, pageSize, search, sortBy, sortOrder } = query;
  const where = { ...filter, ...searchFilter(search, searchFields) };
  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1, _id: sortOrder === "asc" ? 1 : -1 };

  const [rows, total] = await Promise.all([
    Model.find(where).select(select).sort(sort).skip((page - 1) * pageSize).limit(pageSize).lean(),
    Model.countDocuments(where),
  ]);

  return {
    items: rows.map(toDTO),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
};
