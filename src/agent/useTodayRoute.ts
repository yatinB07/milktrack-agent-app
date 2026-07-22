import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentDataError,
  fetchAgentRouteAssignmentPage,
  fetchAgentScheduledDeliveryPage,
  type AgentDataErrorKind,
  type AgentDataRequest,
} from './api';
import { findTodayRouteStop, projectTodayRoute } from './model';
import { agentRouteAssignmentsQuery, agentScheduledDeliveriesQuery } from './queries';

export type TodayRouteStatus = 'loading' | 'success' | 'error';

export function useTodayRoute(request: AgentDataRequest) {
  const queryClient = useQueryClient();
  const [refreshError, setRefreshError] = useState<AgentDataErrorKind>();
  const [paginationError, setPaginationError] = useState<AgentDataErrorKind>();
  const previousServiceDate = useRef<string | undefined>(undefined);
  const assignmentOptions = agentRouteAssignmentsQuery(request);
  const assignments = useInfiniteQuery(assignmentOptions);
  const serviceDate = assignments.data?.pages[0]?.serviceDate;
  const deliveryOptions = agentScheduledDeliveriesQuery({ ...request, serviceDate: serviceDate ?? '' });
  const deliveries = useInfiniteQuery({ ...deliveryOptions, enabled: serviceDate !== undefined });
  const {
    fetchNextPage: fetchNextAssignmentPage,
    hasNextPage: hasMoreAssignments,
    isFetchingNextPage: isLoadingMoreAssignments,
  } = assignments;
  const {
    fetchNextPage: fetchNextDeliveryPage,
    hasNextPage: hasMoreDeliveries,
    isFetchingNextPage: isLoadingMoreDeliveries,
  } = deliveries;

  useEffect(() => {
    const oldServiceDate = previousServiceDate.current;
    previousServiceDate.current = serviceDate;
    if (oldServiceDate && serviceDate && oldServiceDate !== serviceDate) {
      queryClient.removeQueries({
        queryKey: agentScheduledDeliveriesQuery({ ...request, serviceDate: oldServiceDate }).queryKey,
        exact: true,
      });
    }
  }, [queryClient, request, serviceDate]);

  const dateMismatch = serviceDate !== undefined && Boolean(
    assignments.data?.pages.some((page) => page.serviceDate !== serviceDate)
    || deliveries.data?.pages.some((page) => page.serviceDate !== serviceDate),
  );
  const model = useMemo(() => {
    if (!assignments.data || !deliveries.data || !serviceDate) return undefined;
    const assignmentPages = matchingPrefix(assignments.data.pages, serviceDate);
    const deliveryPages = matchingPrefix(deliveries.data.pages, serviceDate);
    return assignmentPages.length && deliveryPages.length
      ? projectTodayRoute({ assignmentPages, deliveryPages })
      : undefined;
  }, [assignments.data, deliveries.data, serviceDate]);
  const status: TodayRouteStatus = dateMismatch
    ? 'error'
    : model
      ? 'success'
      : assignments.isError || deliveries.isError
      ? 'error'
      : 'loading';
  const errorKind = refreshError ?? (dateMismatch
    ? 'unavailable'
    : status === 'error'
      ? kind(assignments.error ?? deliveries.error)
      : undefined);

  const loadMore = useCallback(async () => {
    setPaginationError(undefined);
    try {
      const results = await Promise.all([
        ...(hasMoreAssignments ? [fetchNextAssignmentPage()] : []),
        ...(hasMoreDeliveries ? [fetchNextDeliveryPage()] : []),
      ]);
      const failed = results.find((result) => result.isError);
      if (failed) setPaginationError(kind(failed.error));
    } catch (error) {
      setPaginationError(kind(error));
    }
  }, [fetchNextAssignmentPage, fetchNextDeliveryPage, hasMoreAssignments, hasMoreDeliveries]);

  const refresh = useCallback(async () => {
    setRefreshError(undefined);
    setPaginationError(undefined);
    try {
      const nextAssignments = await fetchAgentRouteAssignmentPage(request);
      const nextServiceDate = nextAssignments.serviceDate;
      const nextDeliveries = await fetchAgentScheduledDeliveryPage({ ...request, serviceDate: nextServiceDate });
      if (nextDeliveries.serviceDate !== nextServiceDate) throw new AgentDataError('unavailable');
      const nextDeliveryOptions = agentScheduledDeliveriesQuery({ ...request, serviceDate: nextServiceDate });

      queryClient.setQueryData(nextDeliveryOptions.queryKey, { pages: [nextDeliveries], pageParams: [undefined] });
      queryClient.setQueryData(assignmentOptions.queryKey, { pages: [nextAssignments], pageParams: [undefined] });
    } catch (error) {
      setRefreshError(kind(error));
    }
  }, [assignmentOptions.queryKey, queryClient, request]);

  const lastRefreshedAt = model && assignments.dataUpdatedAt && deliveries.dataUpdatedAt
    ? Math.min(assignments.dataUpdatedAt, deliveries.dataUpdatedAt)
    : undefined;

  return {
    status,
    loading: status === 'loading',
    errorKind,
    serviceDate,
    model,
    refresh,
    loadMore,
    canLoadMore: Boolean(hasMoreAssignments || hasMoreDeliveries),
    isLoadingMore: isLoadingMoreAssignments || isLoadingMoreDeliveries,
    paginationError,
    lastRefreshedAt,
    findStop: useCallback((routeStopId: string) => model
      ? findTodayRouteStop(model, routeStopId)
      : undefined, [model]),
  };
}

function kind(error: unknown): AgentDataErrorKind {
  return error instanceof AgentDataError ? error.kind : 'unavailable';
}

function matchingPrefix<T extends Readonly<{ serviceDate: string }>>(pages: readonly T[], serviceDate: string) {
  const mismatch = pages.findIndex((page) => page.serviceDate !== serviceDate);
  return mismatch === -1 ? pages : pages.slice(0, mismatch);
}
