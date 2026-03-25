import { success } from "../../lib/response";
import { parseSchema } from "../../lib/validation";
import { importBatchParamsSchema } from "../../schemas/import-batches.schema";

import type { LedgerImportBatchesService } from "../../services/import-batches.service";
import type { FastifyPluginAsync } from "fastify";

type ImportBatchesRoutesOptions = {
  service: LedgerImportBatchesService;
};

const importBatchesRoutes: FastifyPluginAsync<ImportBatchesRoutesOptions> = async (
  fastify,
  options
) => {
  fastify.get("/import-batches", async (request) => {
    const batches = await options.service.listImportBatches(request.user!.organizationId);

    return success(batches);
  });

  fastify.get("/import-batches/:importBatchId", async (request) => {
    const params = parseSchema(importBatchParamsSchema, request.params);
    const batch = await options.service.getImportBatch(
      params.importBatchId,
      request.user!.organizationId
    );

    return success(batch);
  });
};

export default importBatchesRoutes;
