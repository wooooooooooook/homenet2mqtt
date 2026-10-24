import { ConfigItemsError } from '../../../services/config-items.service.js';
import {
  expandGallerySnippet,
  getGallerySnippet,
  getGalleryVendorIndex,
  listGalleryVendors,
  matchGallerySnippets,
} from '../../services/gallery.service.js';
import type { McpTool } from '../types.js';
import { readStringArg } from './args.js';

const vendorProperty = {
  type: 'string',
  description: 'Gallery vendor id such as "commax".',
};

export const galleryTools: McpTool[] = [
  {
    name: 'list_gallery',
    title: 'List gallery presets',
    description:
      "Without vendor, list every gallery vendor with its requirements, snippet count and entity types. With vendor, return that vendor's snippets: parameters, content summary, and the discovery block used to score it against observed packets. GitHub is read first and the packaged gallery directory is the offline fallback, so source reports which one served the data.",
    inputSchema: {
      type: 'object',
      properties: { vendor: vendorProperty },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (_ctx, args) => {
      const vendor = readStringArg(args, 'vendor');
      return { data: vendor ? await getGalleryVendorIndex(vendor) : await listGalleryVendors() };
    },
  },
  {
    name: 'get_gallery_snippet',
    title: 'Read a gallery snippet',
    description:
      'Return one gallery snippet as raw YAML, keyed by a gallery-relative path such as "commax/heaters_new.yaml". Copy mask, ack and value bytes from the snippet, then adapt channel indices before drafting entities.',
    inputSchema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          description: 'Gallery-relative YAML path, e.g. "commax/heaters_new.yaml".',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (_ctx, args) => {
      const file = readStringArg(args, 'file');
      if (!file) {
        throw new ConfigItemsError(
          'GALLERY_FILE_INVALID',
          'file must be a gallery-relative YAML path such as "commax/heaters_new.yaml".',
          400,
        );
      }
      return { data: await getGallerySnippet(file) };
    },
  },
  {
    name: 'match_gallery',
    title: 'Score gallery snippets against observed traffic',
    description:
      'Run every gallery snippet discovery block against the packet dictionary and unmatched packets of a port, sorted by matched packet count, with the inferred parameter values (typically channel counts). Requires log retention to be enabled; returns available=false with a reason when it is not.',
    inputSchema: {
      type: 'object',
      properties: {
        portId: {
          type: 'string',
          description: 'Serial port id. Defaults to the only loaded port when omitted.',
        },
        vendor: vendorProperty,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (ctx, args) => ({
      data: await matchGallerySnippets(ctx, {
        portId: readStringArg(args, 'portId'),
        vendor: readStringArg(args, 'vendor'),
      }),
    }),
  },
  {
    name: 'expand_gallery_snippet',
    title: 'Expand a gallery snippet into a draft',
    description:
      "Resolve a gallery snippet's parameters and expand its $repeat/$if/{{expr}} templates into a draft with entities, automations and scripts, ready to pass to validate_entity_draft and apply_entity_draft. Use the parameterValues inferred by match_gallery or override them explicitly. Returns the resolved parameterValues and item counts alongside the draft.",
    inputSchema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          description: 'Gallery-relative YAML path, e.g. "commax/heaters_new.yaml".',
        },
        parameterValues: {
          type: 'object',
          description:
            'Parameter overrides keyed by parameter name. Missing parameters fall back to their gallery defaults.',
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (_ctx, args) => ({
      data: await expandGallerySnippet({
        file: readStringArg(args, 'file') ?? '',
        parameterValues: args.parameterValues as Record<string, unknown> | undefined,
      }),
    }),
  },
];
